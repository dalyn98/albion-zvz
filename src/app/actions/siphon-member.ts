'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import {
  resolveSiphonPlayer,
  normalizeSiphonRecentLimit,
  summarizeSiphonAccount,
  type SiphonAccountLedgerRow,
  type SiphonAccountSummary,
} from '@/lib/siphon/member-siphon'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'

export type MySiphonAccountResult =
  | { status: 'ready'; account: SiphonAccountSummary }
  | { status: 'unverified'; nickname: string | null }
  | { status: 'error'; error: string }

const RECENT_LIMIT_DEFAULT = 50
const RECENT_LIMIT_MAX = 200
const PAGE_SIZE = 1000

export async function getMySiphonAccount(
  recentLimit = RECENT_LIMIT_DEFAULT,
): Promise<MySiphonAccountResult> {
  try {
    const session = await getSession()
    if (!session || !session.isMember) return { status: 'error', error: 'Unauthorized' }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { status: 'error', error: 'local-account-resource-blocked' }
    }

    const guildId = await getSessionGuildId(session)
    const identityGate = await getAlbionOnboardingGateState(session.discordId, guildId)
    const player = resolveSiphonPlayer(identityGate)
    if (player.status === 'unverified') {
      return { status: 'unverified', nickname: player.nickname }
    }

    const safeLimit = normalizeSiphonRecentLimit(recentLimit, {
      defaultLimit: RECENT_LIMIT_DEFAULT,
      maxLimit: RECENT_LIMIT_MAX,
    })
    const db = getAdminClient()
    const operatingStart = await getLogOperatingStart('siphon', guildId)
    const rows: SiphonAccountLedgerRow[] = []
    let from = 0

    while (true) {
      let q = db
        .from('siphon_ledger')
        .select('logged_at, item_name_raw, quantity')
        .eq('guild_id', guildId)
        .eq('player', player.player)
      if (operatingStart) q = q.gte('logged_at', operatingStart.toISOString())
      const { data, error } = await q
        .order('logged_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)

      if (error) return { status: 'error', error: 'load-failed' }

      const page = data ?? []
      for (const row of page) {
        rows.push({
          loggedAt: row.logged_at as string,
          itemNameRaw: row.item_name_raw as string,
          quantity: row.quantity as number,
        })
      }

      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    return {
      status: 'ready',
      account: summarizeSiphonAccount(player.player, rows, safeLimit),
    }
  } catch {
    return { status: 'error', error: 'server-error' }
  }
}
