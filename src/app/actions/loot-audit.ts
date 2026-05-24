'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { requireAnyCapability } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  buildLootAuditSummary,
  parseDepositLog,
  parseLootLogCsv,
  type DepositLogEntry,
  type LootAuditFinding,
  type LootAuditSummary,
  type LootLogEntry,
  type LootLogParseError,
} from '@/lib/loot-audit'

const LOOT_AUDIT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const
const RAW_MAX_LENGTH = 2_000_000
const ROW_LIMIT = 10_000
const TITLE_MAX_LENGTH = 120
const NOTE_MAX_LENGTH = 500
const INSERT_BATCH_SIZE = 500

const auditInputSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  lootLogRaw: z.string().trim().min(1).max(RAW_MAX_LENGTH),
  depositLogRaw: z.string().trim().min(1).max(RAW_MAX_LENGTH),
})

const findingUpdateSchema = z.object({
  findingId: z.string().uuid(),
  status: z.enum(['open', 'resolved', 'ignored']),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
})

export type LootAuditFindingStatus = 'open' | 'resolved' | 'ignored'
export type LootAuditStatus = 'open' | 'resolved' | 'archived'

export interface LootAuditPreviewResult {
  summary: LootAuditSummary
  lootParseErrors: LootLogParseError[]
  depositParseErrors: LootLogParseError[]
  unresolvedDepositItemNames: string[]
  error?: string
}

export interface LootAuditCreateResult extends LootAuditPreviewResult {
  auditId?: string
}

export interface LootAuditListItem {
  id: string
  title: string
  status: LootAuditStatus
  createdByUsername: string
  lootRowsCount: number
  depositRowsCount: number
  totalEstimatedValue: number
  missingEstimatedValue: number
  unresolvedFindingsCount: number
  createdAt: string
  updatedAt: string
}

export interface LootAuditFindingRow extends LootAuditFinding {
  id: string
  status: LootAuditFindingStatus
  resolutionNote: string | null
  resolvedByDiscordId: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface LootAuditDetail {
  audit: LootAuditListItem
  findings: LootAuditFindingRow[]
  unresolvedDepositItemNames: string[]
}

interface ParsedAuditInput {
  lootEntries: LootLogEntry[]
  depositEntries: DepositLogEntry[]
  preview: LootAuditPreviewResult
}

const emptySummary: LootAuditSummary = {
  totalLootRows: 0,
  auditedLootRows: 0,
  ignoredLootRows: 0,
  totalDepositRows: 0,
  matchedDepositRows: 0,
  totalEstimatedValue: 0,
  missingEstimatedValue: 0,
  findings: [],
  memberSummaries: [],
}

export async function previewLootAudit(
  input: z.input<typeof auditInputSchema>,
): Promise<LootAuditPreviewResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = auditInputSchema.safeParse(input)
    if (!parsed.success) return previewError(tErr('invalidInput'))

    const session = await getSession()
    if (!session) return previewError(tErr('unauthorized'))
    await requireAnyCapability(LOOT_AUDIT_CAPS)

    return parseAuditInput(parsed.data, tErr).preview
  } catch (e) {
    return previewError(e instanceof Error ? e.message : tErr('serverError'))
  }
}

export async function createLootAudit(
  input: z.input<typeof auditInputSchema>,
): Promise<LootAuditCreateResult> {
  const tErr = await getTranslations('adminActionError')
  let guildId: string | null = null
  let createdAuditId: string | null = null

  try {
    const parsed = auditInputSchema.safeParse(input)
    if (!parsed.success) return { ...previewError(tErr('invalidInput')) }

    const session = await getSession()
    if (!session) return { ...previewError(tErr('unauthorized')) }
    const db = await requireAnyCapability(LOOT_AUDIT_CAPS)
    guildId = await getSessionGuildId(session)

    const parsedAudit = parseAuditInput(parsed.data, tErr)
    if (parsedAudit.preview.error) return { ...parsedAudit.preview }

    const { summary } = parsedAudit.preview
    const { data: audit, error: auditError } = await db
      .from('loot_audits')
      .insert({
        guild_id: guildId,
        title: parsed.data.title,
        event_id: null,
        status: summary.findings.length > 0 ? 'open' : 'resolved',
        created_by_discord_id: session.discordId,
        created_by_username: session.username,
        loot_rows_count: summary.totalLootRows,
        deposit_rows_count: summary.totalDepositRows,
        total_estimated_value: summary.totalEstimatedValue,
        missing_estimated_value: summary.missingEstimatedValue,
        unresolved_findings_count: summary.findings.length,
      })
      .select('id')
      .single()
    if (auditError) return { ...parsedAudit.preview, error: auditError.message }

    createdAuditId = audit.id as string
    await insertLootRows(db, guildId, createdAuditId, parsedAudit.lootEntries)
    await insertDepositRows(db, guildId, createdAuditId, parsedAudit.depositEntries)
    await insertFindings(db, guildId, createdAuditId, summary.findings)

    revalidatePath('/admin/dashboard/loot-audit')
    revalidatePath(`/admin/dashboard/loot-audit/${createdAuditId}`)

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'loot_audit.create',
      targetId: createdAuditId,
      targetKind: 'loot_audit',
      details: {
        title: parsed.data.title,
        lootRows: summary.totalLootRows,
        depositRows: summary.totalDepositRows,
        findings: summary.findings.length,
        missingEstimatedValue: summary.missingEstimatedValue,
      },
    })

    return { ...parsedAudit.preview, auditId: createdAuditId }
  } catch (e) {
    if (createdAuditId && guildId) {
      const db = await requireAnyCapability(LOOT_AUDIT_CAPS)
      await db
        .from('loot_audits')
        .delete()
        .eq('guild_id', guildId)
        .eq('id', createdAuditId)
    }
    return { ...previewError(e instanceof Error ? e.message : tErr('serverError')) }
  }
}

export async function listLootAudits(): Promise<{
  audits: LootAuditListItem[]
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { audits: [], error: 'Unauthorized' }
    const db = await requireAnyCapability(LOOT_AUDIT_CAPS)
    const guildId = await getSessionGuildId(session)

    const { data, error } = await db
      .from('loot_audits')
      .select(
        'id, title, status, created_by_username, loot_rows_count, deposit_rows_count, total_estimated_value, missing_estimated_value, unresolved_findings_count, created_at, updated_at',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return { audits: [], error: error.message }

    return {
      audits: (data ?? []).map(mapAuditRow),
    }
  } catch (e) {
    return { audits: [], error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function getLootAuditDetail(
  auditId: string,
): Promise<LootAuditDetail | { error: string }> {
  try {
    const parsedId = z.string().uuid().safeParse(auditId)
    if (!parsedId.success) return { error: 'invalid-input' }

    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const db = await requireAnyCapability(LOOT_AUDIT_CAPS)
    const guildId = await getSessionGuildId(session)

    const { data: auditRow, error: auditError } = await db
      .from('loot_audits')
      .select(
        'id, title, status, created_by_username, loot_rows_count, deposit_rows_count, total_estimated_value, missing_estimated_value, unresolved_findings_count, created_at, updated_at',
      )
      .eq('guild_id', guildId)
      .eq('id', parsedId.data)
      .maybeSingle()
    if (auditError) return { error: auditError.message }
    if (!auditRow) return { error: 'not-found' }

    const [findingsResult, unresolvedResult] = await Promise.all([
      db
        .from('loot_audit_findings')
        .select(
          'id, looted_by_name, item_id, item_name, expected_quantity, deposited_quantity, missing_quantity, unit_estimated_value, missing_estimated_value, status, resolution_note, resolved_by_discord_id, resolved_at, created_at',
        )
        .eq('guild_id', guildId)
        .eq('audit_id', parsedId.data)
        .order('missing_estimated_value', { ascending: false })
        .order('looted_by_name', { ascending: true }),
      db
        .from('loot_audit_deposit_rows')
        .select('item_name_raw')
        .eq('guild_id', guildId)
        .eq('audit_id', parsedId.data)
        .is('item_id', null),
    ])

    if (findingsResult.error) return { error: findingsResult.error.message }
    if (unresolvedResult.error) return { error: unresolvedResult.error.message }

    const unresolvedNames = new Set<string>()
    for (const row of unresolvedResult.data ?? []) {
      unresolvedNames.add(row.item_name_raw as string)
    }

    return {
      audit: mapAuditRow(auditRow),
      findings: (findingsResult.data ?? []).map(mapFindingRow),
      unresolvedDepositItemNames: [...unresolvedNames].sort((a, b) => a.localeCompare(b)),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function updateLootAuditFinding(input: z.input<typeof findingUpdateSchema>): Promise<{
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = findingUpdateSchema.safeParse(input)
    if (!parsed.success) return { error: tErr('invalidInput') }

    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(LOOT_AUDIT_CAPS)
    const guildId = await getSessionGuildId(session)
    const note = parsed.data.note?.trim() || null
    if (note && note.length > NOTE_MAX_LENGTH) {
      return { error: tErr('lootAuditNoteTooLong', { max: NOTE_MAX_LENGTH }) }
    }

    const resolvedPayload =
      parsed.data.status === 'open'
        ? {
            status: 'open',
            resolution_note: null,
            resolved_by_discord_id: null,
            resolved_at: null,
          }
        : {
            status: parsed.data.status,
            resolution_note: note,
            resolved_by_discord_id: session.discordId,
            resolved_at: new Date().toISOString(),
          }

    const { data: updatedRows, error } = await db
      .from('loot_audit_findings')
      .update(resolvedPayload)
      .eq('guild_id', guildId)
      .eq('id', parsed.data.findingId)
      .select('id, audit_id, status, looted_by_name, item_id, missing_quantity')
    if (error) return { error: error.message }
    if (!updatedRows || updatedRows.length === 0) {
      return { error: tErr('lootAuditFindingNotFound') }
    }

    const updated = updatedRows[0]
    await refreshAuditFindingStats(db, guildId, updated.audit_id as string)

    revalidatePath('/admin/dashboard/loot-audit')
    revalidatePath(`/admin/dashboard/loot-audit/${updated.audit_id}`)

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'loot_audit.finding.resolve',
      targetId: parsed.data.findingId,
      targetKind: 'loot_audit_finding',
      details: {
        auditId: updated.audit_id,
        status: parsed.data.status,
        lootedByName: updated.looted_by_name,
        itemId: updated.item_id,
        missingQuantity: updated.missing_quantity,
        note,
      },
    })

    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

function parseAuditInput(
  input: z.infer<typeof auditInputSchema>,
  tErr: Awaited<ReturnType<typeof getTranslations>>,
): ParsedAuditInput {
  const lootResult = parseLootLogCsv(input.lootLogRaw)
  const depositResult = parseDepositLog(input.depositLogRaw)
  const rowCount = lootResult.entries.length + depositResult.entries.length

  if (lootResult.entries.length === 0) {
    return {
      lootEntries: [],
      depositEntries: [],
      preview: {
        ...previewError(tErr('lootAuditNoLootRows')),
        lootParseErrors: lootResult.errors,
        depositParseErrors: depositResult.errors,
      },
    }
  }
  if (depositResult.entries.length === 0) {
    return {
      lootEntries: lootResult.entries,
      depositEntries: [],
      preview: {
        ...previewError(tErr('lootAuditNoDepositRows')),
        lootParseErrors: lootResult.errors,
        depositParseErrors: depositResult.errors,
      },
    }
  }
  if (rowCount > ROW_LIMIT) {
    return {
      lootEntries: lootResult.entries,
      depositEntries: depositResult.entries,
      preview: {
        ...previewError(tErr('importRowLimit', { max: ROW_LIMIT, current: rowCount })),
        lootParseErrors: lootResult.errors,
        depositParseErrors: depositResult.errors,
      },
    }
  }

  const summary = buildLootAuditSummary(lootResult.entries, depositResult.entries)
  return {
    lootEntries: lootResult.entries,
    depositEntries: depositResult.entries,
    preview: {
      summary,
      lootParseErrors: lootResult.errors,
      depositParseErrors: depositResult.errors,
      unresolvedDepositItemNames: depositResult.unresolvedItemNames,
    },
  }
}

function previewError(error: string): LootAuditPreviewResult {
  return {
    summary: emptySummary,
    lootParseErrors: [],
    depositParseErrors: [],
    unresolvedDepositItemNames: [],
    error,
  }
}

async function insertLootRows(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  auditId: string,
  entries: readonly LootLogEntry[],
) {
  for (let i = 0; i < entries.length; i += INSERT_BATCH_SIZE) {
    const rows = entries.slice(i, i + INSERT_BATCH_SIZE).map((entry) => ({
      guild_id: guildId,
      audit_id: auditId,
      looted_at: entry.lootedAt.toISOString(),
      looted_by_alliance: entry.lootedByAlliance,
      looted_by_guild: entry.lootedByGuild,
      looted_by_name: entry.lootedByName,
      item_id: entry.itemId,
      item_name: entry.itemName,
      quantity: entry.quantity,
      looted_from_alliance: entry.lootedFromAlliance,
      looted_from_guild: entry.lootedFromGuild,
      looted_from_name: entry.lootedFromName,
      died: entry.died,
      died_player_guild: entry.diedPlayerGuild,
      killed_by: entry.killedBy,
      killed_by_guild: entry.killedByGuild,
      estimated_market_value: entry.estimatedMarketValue,
      cluster: entry.cluster,
      source_line: entry.line,
      row_hash: entry.rowHash,
      raw: entryToRawJson(entry),
    }))
    const { error } = await db.from('loot_audit_loot_rows').insert(rows)
    if (error) throw new Error(error.message)
  }
}

async function insertDepositRows(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  auditId: string,
  entries: readonly DepositLogEntry[],
) {
  for (let i = 0; i < entries.length; i += INSERT_BATCH_SIZE) {
    const rows = entries.slice(i, i + INSERT_BATCH_SIZE).map((entry) => ({
      guild_id: guildId,
      audit_id: auditId,
      deposited_at: entry.depositedAt.toISOString(),
      player: entry.player,
      item_name_raw: entry.itemName,
      item_id: entry.itemId,
      enchant: entry.enchant,
      quality: entry.quality,
      quantity: entry.quantity,
      source_line: entry.line,
      row_hash: entry.rowHash,
      raw: entryToRawJson(entry),
    }))
    const { error } = await db.from('loot_audit_deposit_rows').insert(rows)
    if (error) throw new Error(error.message)
  }
}

async function insertFindings(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  auditId: string,
  findings: readonly LootAuditFinding[],
) {
  if (findings.length === 0) return
  for (let i = 0; i < findings.length; i += INSERT_BATCH_SIZE) {
    const rows = findings.slice(i, i + INSERT_BATCH_SIZE).map((finding) => ({
      guild_id: guildId,
      audit_id: auditId,
      looted_by_name: finding.lootedByName,
      item_id: finding.itemId,
      item_name: finding.itemName,
      expected_quantity: finding.expectedQuantity,
      deposited_quantity: finding.depositedQuantity,
      missing_quantity: finding.missingQuantity,
      unit_estimated_value: finding.unitEstimatedValue,
      missing_estimated_value: finding.missingEstimatedValue,
    }))
    const { error } = await db.from('loot_audit_findings').insert(rows)
    if (error) throw new Error(error.message)
  }
}

async function refreshAuditFindingStats(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  auditId: string,
) {
  const { count, error } = await db
    .from('loot_audit_findings')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('audit_id', auditId)
    .eq('status', 'open')
  if (error) throw new Error(error.message)

  const openCount = count ?? 0
  const { error: updateError } = await db
    .from('loot_audits')
    .update({
      unresolved_findings_count: openCount,
      status: openCount === 0 ? 'resolved' : 'open',
    })
    .eq('guild_id', guildId)
    .eq('id', auditId)
  if (updateError) throw new Error(updateError.message)
}

function mapAuditRow(row: Record<string, unknown>): LootAuditListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as LootAuditStatus,
    createdByUsername: row.created_by_username as string,
    lootRowsCount: row.loot_rows_count as number,
    depositRowsCount: row.deposit_rows_count as number,
    totalEstimatedValue: Number(row.total_estimated_value ?? 0),
    missingEstimatedValue: Number(row.missing_estimated_value ?? 0),
    unresolvedFindingsCount: row.unresolved_findings_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapFindingRow(row: Record<string, unknown>): LootAuditFindingRow {
  return {
    id: row.id as string,
    lootedByName: row.looted_by_name as string,
    itemId: row.item_id as string,
    itemName: row.item_name as string,
    expectedQuantity: row.expected_quantity as number,
    depositedQuantity: row.deposited_quantity as number,
    missingQuantity: row.missing_quantity as number,
    unitEstimatedValue: Number(row.unit_estimated_value ?? 0),
    missingEstimatedValue: Number(row.missing_estimated_value ?? 0),
    status: row.status as LootAuditFindingStatus,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    resolvedByDiscordId: (row.resolved_by_discord_id as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

function entryToRawJson(entry: LootLogEntry | DepositLogEntry): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    raw[key] = value instanceof Date ? value.toISOString() : value
  }
  return raw
}
