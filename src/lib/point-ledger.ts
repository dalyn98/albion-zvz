import type { getAdminClient } from './supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const POINT_LEDGER_PAGE_SIZE = 1000
const IN_FILTER_CHUNK_SIZE = 100

export interface MemberPointSummary {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

export interface GuildPointDeltaRow {
  discordId: string
  delta: number
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

function applyDelta(summary: MemberPointSummary, delta: number): MemberPointSummary {
  return {
    balance: summary.balance + delta,
    lifetimeEarned: summary.lifetimeEarned + (delta > 0 ? delta : 0),
    lifetimeSpent: summary.lifetimeSpent + (delta < 0 ? -delta : 0),
  }
}

function emptySummary(): MemberPointSummary {
  return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 }
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
  let summary = emptySummary()
  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const { data, error } = await db
      .from('point_ledger')
      .select('delta')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .order('id', { ascending: true })
      .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

    if (error) return { summary, error: error.message }
    const rows = data ?? []
    for (const row of rows) {
      const delta = Number(row.delta) || 0
      summary = applyDelta(summary, delta)
    }
    if (rows.length < POINT_LEDGER_PAGE_SIZE) return { summary }
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

export async function getPointBalancesByMember(
  db: SupabaseAdminClient,
  guildId: string,
  discordIds: readonly string[],
): Promise<{ balances: Map<string, number>; error?: string }> {
  const uniqueIds = Array.from(new Set(discordIds.filter(Boolean)))
  const balances = new Map<string, number>()
  if (uniqueIds.length === 0) return { balances }

  for (const idChunk of chunks(uniqueIds, IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
      const { data, error } = await db
        .from('point_ledger')
        .select('discord_id, delta')
        .eq('guild_id', guildId)
        .in('discord_id', idChunk)
        .order('id', { ascending: true })
        .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

      if (error) return { balances, error: error.message }
      const rows = data ?? []
      for (const row of rows) {
        const discordId = row.discord_id as string
        balances.set(discordId, (balances.get(discordId) ?? 0) + (Number(row.delta) || 0))
      }
      if (rows.length < POINT_LEDGER_PAGE_SIZE) break
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

  for (const guildChunk of chunks(uniqueGuildIds, IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
      const { data, error } = await db
        .from('point_ledger')
        .select('guild_id, delta')
        .in('guild_id', guildChunk)
        .eq('discord_id', discordId)
        .order('id', { ascending: true })
        .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

      if (error) return { balances, error: error.message }
      const rows = data ?? []
      for (const row of rows) {
        const guildId = row.guild_id as string
        balances.set(guildId, (balances.get(guildId) ?? 0) + (Number(row.delta) || 0))
      }
      if (rows.length < POINT_LEDGER_PAGE_SIZE) break
    }
  }

  return { balances }
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
): Promise<{ rows: MemberPointLedgerEntryRow[]; error?: string }> {
  const rows: MemberPointLedgerEntryRow[] = []
  for (let from = 0; ; from += POINT_LEDGER_PAGE_SIZE) {
    const { data, error } = await db
      .from('point_ledger')
      .select('id, delta, reason, memo, created_at, handled_by_username')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + POINT_LEDGER_PAGE_SIZE - 1)

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
    if (page.length < POINT_LEDGER_PAGE_SIZE) return { rows }
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
