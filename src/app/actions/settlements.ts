'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantTimezone } from '@/lib/timezone-server'
import { zonedPartsToUtc } from '@/lib/timezone'
import { buildSettlementLines, type SettlementLineDraft } from '@/lib/settlements'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'

const PAGE_SIZE = 1000
const NOTES_MAX_LENGTH = 500

export type SettlementStatus = 'draft' | 'closed'

export interface SettlementPeriodSummary {
  id: string
  periodStart: string
  periodEnd: string
  status: SettlementStatus
  notes: string | null
  createdAt: string
  createdByUsername: string | null
  closedAt: string | null
  lineCount: number
  totalReceivableSilver: number
  totalPayableSilver: number
}

export interface SettlementLine {
  id: string
  discordId: string
  username: string | null
  openingBalance: number
  earned: number
  spent: number
  closingBalance: number
  receivableSilver: number
  payableSilver: number
  ledgerEntryCount: number
  sourceBreakdown: Record<string, number>
  sinkBreakdown: Record<string, number>
}

export interface SettlementDetail {
  period: SettlementPeriodSummary
  lines: SettlementLine[]
}

export interface SettlementActionState {
  error?: string
}

interface SettlementPeriodRow {
  id: string
  period_start: string
  period_end: string
  status: SettlementStatus
  notes: string | null
  created_at: string
  created_by_username: string | null
  closed_at: string | null
}

interface SettlementLineRow {
  id: string
  discord_id: string
  username: string | null
  opening_balance: number
  earned: number
  spent: number
  closing_balance: number
  receivable_silver: number
  payable_silver: number
  ledger_entry_count: number
  source_breakdown: unknown
  sink_breakdown: unknown
}

interface PointLedgerRow {
  discord_id: string
  delta: number
  reason: string
  created_at: string
}

interface MonthRange {
  periodStart: string
  periodEnd: string
  periodStartIso: string
  periodEndIso: string
}

export async function listSettlementPeriods(): Promise<{
  periods: SettlementPeriodSummary[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { periods: [], error: tErr('unauthorized') }
    const db = await requireCapability(CAP.SETTLEMENT_MANAGE)
    const guildId = await getSessionGuildId(session)

    const { data: periods, error } = await db
      .from('settlement_periods')
      .select('id, period_start, period_end, status, notes, created_at, created_by_username, closed_at')
      .eq('guild_id', guildId)
      .order('period_start', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { periods: [], error: error.message }

    const summaries = await hydratePeriodSummaries(db, guildId, (periods ?? []) as SettlementPeriodRow[])
    return { periods: summaries }
  } catch (e) {
    return { periods: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getSettlementDetail(id: string): Promise<{
  detail?: SettlementDetail
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.SETTLEMENT_MANAGE)
    const guildId = await getSessionGuildId(session)

    const { data: period, error: periodError } = await db
      .from('settlement_periods')
      .select('id, period_start, period_end, status, notes, created_at, created_by_username, closed_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (periodError) return { error: periodError.message }
    if (!period) return { error: tErr('requestNotFound') }

    const { data: rows, error: rowsError } = await db
      .from('settlement_lines')
      .select(
        'id, discord_id, username, opening_balance, earned, spent, closing_balance, receivable_silver, payable_silver, ledger_entry_count, source_breakdown, sink_breakdown',
      )
      .eq('guild_id', guildId)
      .eq('period_id', id)
      .order('receivable_silver', { ascending: false })
      .order('payable_silver', { ascending: false })
    if (rowsError) return { error: rowsError.message }

    const [summary] = await hydratePeriodSummaries(db, guildId, [period as SettlementPeriodRow])
    return {
      detail: {
        period: summary,
        lines: ((rows ?? []) as SettlementLineRow[]).map(mapLineRow),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listMySettlementLines(): Promise<{
  lines: Array<SettlementLine & { period: SettlementPeriodSummary }>
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session?.isMember) return { lines: [], error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const { data: rows, error } = await db
      .from('settlement_lines')
      .select(
        'id, discord_id, username, opening_balance, earned, spent, closing_balance, receivable_silver, payable_silver, ledger_entry_count, source_breakdown, sink_breakdown, settlement_periods!inner(id, period_start, period_end, status, notes, created_at, created_by_username, closed_at)',
      )
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .order('created_at', { ascending: false })
    if (error) return { lines: [], error: error.message }

    const lines = ((rows ?? []) as Array<SettlementLineRow & { settlement_periods: SettlementPeriodRow | SettlementPeriodRow[] }>).flatMap((row) => {
      const periodRow = Array.isArray(row.settlement_periods)
        ? row.settlement_periods[0]
        : row.settlement_periods
      if (!periodRow) return []
      return [{
        ...mapLineRow(row),
        period: {
          id: periodRow.id,
          periodStart: periodRow.period_start,
          periodEnd: periodRow.period_end,
          status: periodRow.status,
          notes: periodRow.notes,
          createdAt: periodRow.created_at,
          createdByUsername: periodRow.created_by_username,
          closedAt: periodRow.closed_at,
          lineCount: 0,
          totalReceivableSilver: 0,
          totalPayableSilver: 0,
        },
      }]
    })

    return { lines }
  } catch (e) {
    return { lines: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function createSettlementPeriodAction(
  _prevState: SettlementActionState,
  formData: FormData,
): Promise<SettlementActionState> {
  const tErr = await getTranslations('adminActionError')
  let createdId: string | null = null
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.SETTLEMENT_MANAGE)
    const guildId = await getSessionGuildId(session)
    const tz = await getTenantTimezone(guildId)
    const month = String(formData.get('month') ?? '')
    const notes = normalizeNotes(String(formData.get('notes') ?? ''))
    const range = parseMonthRange(month, tz)
    if (!range) return { error: tErr('invalidInput') }
    if (notes.length > NOTES_MAX_LENGTH) {
      return { error: tErr('valueTooLong', { max: NOTES_MAX_LENGTH }) }
    }

    const [ledgerRows, members] = await Promise.all([
      fetchLedgerRowsBefore(db, guildId, range.periodEndIso),
      fetchMembers(db, guildId),
    ])
    const lineDrafts = buildSettlementLines({
      periodStartIso: range.periodStartIso,
      periodEndIso: range.periodEndIso,
      ledgerRows,
      members,
    })

    const { data: period, error: periodError } = await db
      .from('settlement_periods')
      .insert({
        guild_id: guildId,
        period_start: range.periodStart,
        period_end: range.periodEnd,
        notes: notes || null,
        created_by_discord_id: session.discordId,
        created_by_username: session.username,
      })
      .select('id')
      .single()
    if (periodError) return { error: periodError.message }
    const periodId = String(period.id)
    createdId = periodId

    const rows = lineDrafts.map((line) => toInsertLine(guildId, periodId, line))
    for (let from = 0; from < rows.length; from += PAGE_SIZE) {
      const slice = rows.slice(from, from + PAGE_SIZE)
      if (slice.length === 0) continue
      const { error } = await db.from('settlement_lines').insert(slice)
      if (error) {
        await db.from('settlement_periods').delete().eq('guild_id', guildId).eq('id', periodId)
        return { error: error.message }
      }
    }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settlement.create',
      targetKind: 'settlement_period',
      targetId: periodId,
      details: {
        periodStart: range.periodStart,
        periodEnd: range.periodEnd,
        lineCount: rows.length,
      },
    })

    revalidatePath('/admin/dashboard/settlements')
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }

  redirect(`/admin/dashboard/settlements/${createdId}`)
}

export async function closeSettlementPeriodAction(
  _prevState: SettlementActionState,
  formData: FormData,
): Promise<SettlementActionState> {
  const tErr = await getTranslations('adminActionError')
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: tErr('invalidInput') }

  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.SETTLEMENT_MANAGE)
    const guildId = await getSessionGuildId(session)

    const { data: period, error: periodError } = await db
      .from('settlement_periods')
      .select('id, status')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (periodError) return { error: periodError.message }
    if (!period) return { error: tErr('requestNotFound') }
    if (period.status === 'closed') return {}

    const { error } = await db
      .from('settlement_periods')
      .update({
        status: 'closed',
        closed_by_discord_id: session.discordId,
        closed_by_username: session.username,
        closed_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settlement.close',
      targetKind: 'settlement_period',
      targetId: id,
    })
    revalidatePath('/admin/dashboard/settlements')
    revalidatePath(`/admin/dashboard/settlements/${id}`)
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }

  return {}
}

function normalizeNotes(input: string): string {
  return input.trim().replace(/\s+\n/g, '\n')
}

function parseMonthRange(monthInput: string, tz: string): MonthRange | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthInput)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  const periodStartIso = zonedPartsToUtc({ year, month, day: 1, hour: 0, minute: 0 }, tz).toISOString()
  const periodEndIso = zonedPartsToUtc({ year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0 }, tz).toISOString()
  return { periodStart, periodEnd, periodStartIso, periodEndIso }
}

async function fetchLedgerRowsBefore(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  periodEndIso: string,
) {
  const rows: PointLedgerRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('point_ledger')
      .select('discord_id, delta, reason, created_at')
      .eq('guild_id', guildId)
      .lt('created_at', periodEndIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as PointLedgerRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return rows.map((row) => ({
    discordId: row.discord_id,
    delta: Number(row.delta ?? 0),
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

async function fetchMembers(db: ReturnType<typeof getAdminClient>, guildId: string) {
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, username')
    .eq('guild_id', guildId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    discordId: String(row.discord_id),
    username: typeof row.username === 'string' ? row.username : null,
  }))
}

async function hydratePeriodSummaries(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  periods: SettlementPeriodRow[],
): Promise<SettlementPeriodSummary[]> {
  const periodIds = periods.map((period) => period.id)
  const totalsByPeriod = new Map<string, { lineCount: number; receivable: number; payable: number }>()
  if (periodIds.length > 0) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from('settlement_lines')
        .select('period_id, receivable_silver, payable_silver')
        .eq('guild_id', guildId)
        .in('period_id', periodIds)
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      const page = data ?? []
      for (const row of page) {
        const periodId = String(row.period_id)
        const current = totalsByPeriod.get(periodId) ?? { lineCount: 0, receivable: 0, payable: 0 }
        totalsByPeriod.set(periodId, {
          lineCount: current.lineCount + 1,
          receivable: current.receivable + Number(row.receivable_silver ?? 0),
          payable: current.payable + Number(row.payable_silver ?? 0),
        })
      }
      if (page.length < PAGE_SIZE) break
    }
  }

  return periods.map((period) => {
    const totals = totalsByPeriod.get(period.id) ?? { lineCount: 0, receivable: 0, payable: 0 }
    return {
      id: period.id,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      status: period.status,
      notes: period.notes,
      createdAt: period.created_at,
      createdByUsername: period.created_by_username,
      closedAt: period.closed_at,
      lineCount: totals.lineCount,
      totalReceivableSilver: totals.receivable,
      totalPayableSilver: totals.payable,
    }
  })
}

function mapLineRow(row: SettlementLineRow): SettlementLine {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    openingBalance: Number(row.opening_balance ?? 0),
    earned: Number(row.earned ?? 0),
    spent: Number(row.spent ?? 0),
    closingBalance: Number(row.closing_balance ?? 0),
    receivableSilver: Number(row.receivable_silver ?? 0),
    payableSilver: Number(row.payable_silver ?? 0),
    ledgerEntryCount: Number(row.ledger_entry_count ?? 0),
    sourceBreakdown: normalizeBreakdown(row.source_breakdown),
    sinkBreakdown: normalizeBreakdown(row.sink_breakdown),
  }
}

function normalizeBreakdown(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    const amount = Number(raw)
    if (Number.isFinite(amount) && amount > 0) output[key] = amount
  }
  return output
}

function toInsertLine(guildId: string, periodId: string, line: SettlementLineDraft) {
  return {
    guild_id: guildId,
    period_id: periodId,
    discord_id: line.discordId,
    username: line.username,
    opening_balance: line.openingBalance,
    earned: line.earned,
    spent: line.spent,
    closing_balance: line.closingBalance,
    receivable_silver: line.receivableSilver,
    payable_silver: line.payableSilver,
    ledger_entry_count: line.ledgerEntryCount,
    source_breakdown: line.sourceBreakdown,
    sink_breakdown: line.sinkBreakdown,
  }
}
