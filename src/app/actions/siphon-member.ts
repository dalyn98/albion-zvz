'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import {
  resolveSiphonPlayer,
  normalizeSiphonRecentLimit,
  type SiphonAccountSummary,
} from '@/lib/siphon/member-siphon'
import { loadMemberSiphonAccount } from '@/lib/siphon/member-siphon-account-server'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'

export type MySiphonAccountResult =
  | { status: 'ready'; account: SiphonAccountSummary }
  | { status: 'unverified'; nickname: string | null }
  | { status: 'error'; error: string }

const RECENT_LIMIT_DEFAULT = 50
const RECENT_LIMIT_MAX = 200

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
    const result = await loadMemberSiphonAccount({
      db,
      guildId,
      player: player.player,
      operatingStart,
      recentLimit: safeLimit,
    })
    if ('error' in result) return { status: 'error', error: result.error }

    return {
      status: 'ready',
      account: result.account,
    }
  } catch {
    return { status: 'error', error: 'server-error' }
  }
}
