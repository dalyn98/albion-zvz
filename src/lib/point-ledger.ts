import type { getAdminClient } from './supabase-admin'
import { accessIdentityType } from './stable-member-ownership'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const POINT_LEDGER_PAGE_SIZE = 1000
const IN_FILTER_CHUNK_SIZE = 100

export interface MemberPointSummary {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

export interface MemberSpendablePointSummary extends MemberPointSummary {
  escrowed: number
  spendable: number
}

export interface GuildPointDeltaRow {
  discordId: string
  delta: number
}

export interface GuildPointBalanceSummaryRow {
  discordId: string
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
  entriesCount: number
}

export interface MemberPointLedgerEntryRow {
  id: string
  delta: number
  reason: string
  memo: string | null
  createdAt: string
  handledByUsername: string | null
}

export interface GuildPointFlowRow {
  delta: number
  reason: string
  createdAt: string
}

export interface PointLedgerListOptions {
  limit?: number
}

interface MemberPointAccountSnapshotRow {
  guildMemberId: string | null
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
  entriesCount: number
  escrowed: number
  spendable: number
}

function emptySummary(): MemberPointSummary {
  return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 }
}

function normalizePointAccountSnapshot(value: unknown): MemberPointAccountSnapshotRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const integer = (key: string): number => {
    const result = Number(row[key])
    return Number.isSafeInteger(result) ? result : 0
  }
  return {
    guildMemberId:
      typeof row.guildMemberId === 'string' && row.guildMemberId
        ? row.guildMemberId
        : null,
    balance: integer('balance'),
    lifetimeEarned: integer('lifetimeEarned'),
    lifetimeSpent: integer('lifetimeSpent'),
    entriesCount: integer('entriesCount'),
    escrowed: integer('escrowed'),
    spendable: integer('spendable'),
  }
}

async function loadMemberPointAccountSnapshot(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ snapshot: MemberPointAccountSnapshotRow; error?: string }> {
  const { data, error } = await db.rpc('member_point_account_snapshot', {
    p_guild_id: guildId,
    p_subject_id: discordId,
  })
  if (error) {
    return {
      snapshot: {
        guildMemberId: null,
        ...emptySummary(),
        entriesCount: 0,
        escrowed: 0,
        spendable: 0,
      },
      error: error.message,
    }
  }
  const snapshot = normalizePointAccountSnapshot(data)
  if (!snapshot) {
    return {
      snapshot: {
        guildMemberId: null,
        ...emptySummary(),
        entriesCount: 0,
        escrowed: 0,
        spendable: 0,
      },
      error: 'Invalid member point account snapshot',
    }
  }
  return { snapshot }
}

function normalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) return null
  if (!Number.isFinite(limit)) return null
  return Math.max(0, Math.trunc(limit))
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size))
  }
  return result
}

export async function getMemberPointSummary(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ summary: MemberPointSummary; error?: string }> {
  const { snapshot, error } = await loadMemberPointAccountSnapshot(
    db,
    guildId,
    discordId,
  )
  return {
    summary: {
      balance: snapshot.balance,
      lifetimeEarned: snapshot.lifetimeEarned,
      lifetimeSpent: snapshot.lifetimeSpent,
    },
    error,
  }
}

export async function getMemberPointBalance(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ balance: number; error?: string }> {
  const { summary, error } = await getMemberPointSummary(db, guildId, discordId)
  return { balance: summary.balance, error }
}

export async function getMemberPointEscrowed(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ escrowed: number; error?: string }> {
  const { snapshot, error } = await loadMemberPointAccountSnapshot(
    db,
    guildId,
    discordId,
  )
  return { escrowed: snapshot.escrowed, error }
}

export async function getMemberSpendablePointSummary(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ summary: MemberSpendablePointSummary; error?: string }> {
  const { snapshot, error } = await loadMemberPointAccountSnapshot(
    db,
    guildId,
    discordId,
  )
  return {
    summary: {
      balance: snapshot.balance,
      lifetimeEarned: snapshot.lifetimeEarned,
      lifetimeSpent: snapshot.lifetimeSpent,
      escrowed: snapshot.escrowed,
      spendable: snapshot.spendable,
    },
    error,
  }
}

export async function getMemberSpendablePointBalance(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
): Promise<{ balance: number; escrowed: number; spendable: number; error?: string }> {
  const { summary, error } = await getMemberSpendablePointSummary(db, guildId, discordId)
  return {
    balance: summary.balance,
    escrowed: summary.escrowed,
    spendable: summary.spendable,
    error,
  }
}

export async function getPointBalancesByMember(
  db: SupabaseAdminClient,
  guildId: string,
  discordIds: readonly string[],
): Promise<{ balances: Map<string, number>; error?: string }> {
  const uniqueIds = Array.from(new Set(discordIds.filter(Boolean)))
  const balances = new Map<string, number>()
  if (uniqueIds.length === 0) return { balances }

  for (const idChunk of chunks(uniqueIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('guild_member_point_balances_v1')
      .select('discord_id, balance')
      .eq('guild_id', guildId)
      .in('discord_id', idChunk)
      .range(0, idChunk.length - 1)

    if (error) return { balances, error: error.message }
    for (const row of data ?? []) {
      const discordId = row.discord_id as string
      balances.set(discordId, Number(row.balance) || 0)
    }
  }

  return { balances }
}

export async function getPointBalancesByGuildForMember(
  db: SupabaseAdminClient,
  guildIds: readonly string[],
  discordId: string,
): Promise<{ balances: Map<string, number>; error?: string }> {
  const uniqueGuildIds = Array.from(new Set(guildIds.filter(Boolean)))
  const balances = new Map<string, number>()
  if (uniqueGuildIds.length === 0) return { balances }

  const snapshots = await Promise.all(
    uniqueGuildIds.map(async (guildId) => ({
      guildId,
      result: await loadMemberPointAccountSnapshot(db, guildId, discordId),
    })),
  )
  for (const { guildId, result } of snapshots) {
    if (result.error) return { balances, error: result.error }
    balances.set(guildId, result.snapshot.balance)
  }

  return { balances }
}

export async function listGuildPointBalanceSummaries(
  db: SupabaseAdminClient,
  guildId: string,
): Promise<{ rows: GuildPointBalanceSummaryRow[]; error?: string }> {
  const rows: GuildPointBalanceSummaryRow[] = []
  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const { data, error } = await db
      .from('guild_member_point_balances_v1')
      .select('discord_id, balance, lifetime_earned, lifetime_spent, entries_count')
      .eq('guild_id', guildId)
      .order('balance', { ascending: false })
      .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(
      ...page.map((row) => ({
        discordId: row.discord_id as string,
        balance: Number(row.balance) || 0,
        lifetimeEarned: Number(row.lifetime_earned) || 0,
        lifetimeSpent: Number(row.lifetime_spent) || 0,
        entriesCount: Number(row.entries_count) || 0,
      })),
    )
    if (page.length < POINT_LEDGER_PAGE_SIZE) return { rows }
  }
}

export async function listGuildPointDeltas(
  db: SupabaseAdminClient,
  guildId: string,
): Promise<{ rows: GuildPointDeltaRow[]; error?: string }> {
  const rows: GuildPointDeltaRow[] = []
  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const { data, error } = await db
      .from('point_ledger')
      .select('discord_id, delta')
      .eq('guild_id', guildId)
      .order('id', { ascending: true })
      .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(
      ...page.map((row) => ({
        discordId: row.discord_id as string,
        delta: Number(row.delta) || 0,
      })),
    )
    if (page.length < POINT_LEDGER_PAGE_SIZE) return { rows }
  }
}

export async function listMemberPointLedgerEntries(
  db: SupabaseAdminClient,
  guildId: string,
  discordId: string,
  options: PointLedgerListOptions = {},
): Promise<{ rows: MemberPointLedgerEntryRow[]; error?: string }> {
  const rows: MemberPointLedgerEntryRow[] = []
  const limit = normalizeLimit(options.limit)
  if (limit === 0) return { rows }

  const resolved = await db.rpc('resolve_guild_member_id', {
    p_guild_id: guildId,
    p_identity_type: accessIdentityType(discordId),
    p_subject_id: discordId,
  })
  if (resolved.error) return { rows, error: resolved.error.message }
  const guildMemberId = typeof resolved.data === 'string' ? resolved.data : null

  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const remaining = limit === null ? POINT_LEDGER_PAGE_SIZE : limit - rows.length
    const pageSize = Math.min(POINT_LEDGER_PAGE_SIZE, remaining)
    let query = db
      .from('point_ledger')
      .select('id, delta, reason, memo, created_at, handled_by_username')
      .eq('guild_id', guildId)
    query = guildMemberId
      ? query.eq('guild_member_id', guildMemberId)
      : query.eq('discord_id', discordId)
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(
      ...page.map((row) => ({
        id: row.id as string,
        delta: Number(row.delta) || 0,
        reason: (row.reason as string) ?? '',
        memo: (row.memo as string | null) ?? null,
        createdAt: row.created_at as string,
        handledByUsername: (row.handled_by_username as string | null) ?? null,
      })),
    )
    if (limit !== null && rows.length >= limit) return { rows }
    if (page.length < pageSize) return { rows }
  }
}

export async function listGuildPointFlowRowsSince(
  db: SupabaseAdminClient,
  guildId: string,
  sinceIso: string,
): Promise<{ rows: GuildPointFlowRow[]; error?: string }> {
  const rows: GuildPointFlowRow[] = []
  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const { data, error } = await db
      .from('point_ledger')
      .select('delta, reason, created_at')
      .eq('guild_id', guildId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(
      ...page.map((row) => ({
        delta: Number(row.delta) || 0,
        reason: (row.reason as string) || 'unknown',
        createdAt: row.created_at as string,
      })),
    )
    if (page.length < POINT_LEDGER_PAGE_SIZE) return { rows }
  }
}
