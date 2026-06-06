import 'server-only'

import type { getAdminClient } from '@/lib/supabase-admin'
import { isMissingRpcError } from '@/lib/supabase-rpc-errors'
import type { SiphonAccountLedgerRow, SiphonAccountSummary } from './member-siphon'

const MEMBER_SIPHON_ACCOUNT_RPC = 'get_member_siphon_account'
const PAGE_SIZE = 1000

type AdminDbClient = ReturnType<typeof getAdminClient>

interface LoadMemberSiphonAccountOptions {
  db: AdminDbClient
  guildId: string
  player: string
  operatingStart: Date | null
  recentLimit: number
}

interface MemberSiphonAccountRpcRow {
  player: string | null
  deposited: number | string | null
  withdrawn: number | string | null
  net: number | string | null
  last_activity_at: string | null
  rows: unknown
}

export type LoadMemberSiphonAccountResult =
  | { account: SiphonAccountSummary }
  | { error: string }

export async function loadMemberSiphonAccount(
  options: LoadMemberSiphonAccountOptions,
): Promise<LoadMemberSiphonAccountResult> {
  const recentLimit = normalizeRecentLimit(options.recentLimit)
  const { data, error } = await options.db.rpc(MEMBER_SIPHON_ACCOUNT_RPC, {
    p_guild_id: options.guildId,
    p_player: options.player,
    p_operating_start: options.operatingStart?.toISOString() ?? null,
    p_recent_limit: recentLimit,
  })

  if (!error) {
    return {
      account: accountFromRpcRow(options.player, recentLimit, firstRpcRow(data)),
    }
  }

  if (!isMissingRpcError(error, MEMBER_SIPHON_ACCOUNT_RPC)) {
    return { error: error.message ?? 'load-failed' }
  }

  return loadMemberSiphonAccountFallback({
    ...options,
    recentLimit,
  })
}

function firstRpcRow(data: unknown): MemberSiphonAccountRpcRow | null {
  if (!Array.isArray(data)) return null
  const [row] = data
  if (!row || typeof row !== 'object') return null
  return row as MemberSiphonAccountRpcRow
}

function accountFromRpcRow(
  fallbackPlayer: string,
  recentLimit: number,
  row: MemberSiphonAccountRpcRow | null,
): SiphonAccountSummary {
  const deposited = Number(row?.deposited ?? 0)
  const withdrawn = Number(row?.withdrawn ?? 0)
  const net = Number(row?.net ?? deposited - withdrawn)

  return {
    player: row?.player?.trim() || fallbackPlayer,
    deposited: Number.isFinite(deposited) ? deposited : 0,
    withdrawn: Number.isFinite(withdrawn) ? withdrawn : 0,
    net: Number.isFinite(net) ? net : 0,
    lastActivityAt: row?.last_activity_at ?? null,
    rows: parseRecentRows(row?.rows).slice(0, recentLimit),
  }
}

function parseRecentRows(value: unknown): SiphonAccountLedgerRow[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((rawRow): SiphonAccountLedgerRow[] => {
    if (!rawRow || typeof rawRow !== 'object') return []
    const row = rawRow as Record<string, unknown>
    const loggedAt = row.logged_at ?? row.loggedAt
    const itemNameRaw = row.item_name_raw ?? row.itemNameRaw
    const quantity = Number(row.quantity)

    if (typeof loggedAt !== 'string' || !Number.isFinite(quantity)) return []

    return [{
      loggedAt,
      itemNameRaw: typeof itemNameRaw === 'string' ? itemNameRaw : '',
      quantity,
    }]
  })
}

async function loadMemberSiphonAccountFallback(
  options: LoadMemberSiphonAccountOptions,
): Promise<LoadMemberSiphonAccountResult> {
  let deposited = 0
  let withdrawn = 0
  let lastActivityAt: string | null = null
  const recentRows: SiphonAccountLedgerRow[] = []
  let from = 0

  while (true) {
    let q = options.db
      .from('siphon_ledger')
      .select('logged_at, item_name_raw, quantity')
      .eq('guild_id', options.guildId)
      .eq('player', options.player)

    if (options.operatingStart) {
      q = q.gte('logged_at', options.operatingStart.toISOString())
    }

    const { data, error } = await q
      .order('logged_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { error: error.message ?? 'load-failed' }

    const rows = data ?? []
    for (const row of rows) {
      const loggedAt = row.logged_at as string
      const quantity = Number(row.quantity)
      if (!Number.isFinite(quantity)) continue

      if (quantity > 0) deposited += quantity
      else withdrawn += -quantity

      if (!lastActivityAt) lastActivityAt = loggedAt
      if (recentRows.length < options.recentLimit) {
        recentRows.push({
          loggedAt,
          itemNameRaw: (row.item_name_raw as string | null) ?? '',
          quantity,
        })
      }
    }

    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return {
    account: {
      player: options.player,
      deposited,
      withdrawn,
      net: deposited - withdrawn,
      lastActivityAt,
      rows: recentRows,
    },
  }
}

function normalizeRecentLimit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
