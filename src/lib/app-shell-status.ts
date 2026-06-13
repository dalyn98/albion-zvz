import 'server-only'

import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import {
  canUseAllianceEventFeaturesForSession,
  getAlbionOnboardingGateState,
} from '@/lib/albion-identity'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
import { getMemberPendingRequestCounts } from '@/lib/member-pending-counts'
import { getMemberPointBalance } from '@/lib/point-ledger'
import type { SessionPayload } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { sessionHasAny } from '@/lib/session'
import { resolveSiphonPlayer } from '@/lib/siphon/member-siphon'
import { loadMemberSiphonAccount } from '@/lib/siphon/member-siphon-account-server'
import type {
  UserStatusSiphonState,
  UserStatusSummary,
} from '@/components/UserStatusChip'

export interface AppShellStatusPayload {
  adminBadges: AdminBadgeCounts | null
  userStatus: UserStatusSummary | null
}

export async function loadAppShellStatus(
  guildId: string,
  session: SessionPayload,
): Promise<AppShellStatusPayload> {
  const canReviewQueues = session.isAdmin || sessionHasAny(session, [
    CAP.REGEAR_APPROVE,
    CAP.REGEAR_EDIT_PRICE,
    CAP.REGEAR_BULK_ACTION,
    CAP.INVENTORY_DELIVER,
    CAP.EVENT_MANAGE,
    CAP.CRAFT_TASK_DELIVER,
    CAP.CRAFT_MASTER,
  ])

  const allianceEventAllowed =
    (session.isAllianceCandidate || session.isBombSquadCaller) &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest
      ? await canUseAllianceEventFeaturesForSession(session.discordId, guildId)
      : false
  const isBombSquadCallerOnly =
    session.isBombSquadCaller &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest
  const isAllianceEventOnly =
    allianceEventAllowed &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest
  const isAllianceCandidateOnly =
    session.isAllianceCandidate &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest &&
    !session.isBombSquadCaller

  const [adminBadges, userStatus] = await Promise.all([
    canReviewQueues ? getAdminBadgeCounts(guildId) : Promise.resolve(null),
    isBombSquadCallerOnly || isAllianceEventOnly || isAllianceCandidateOnly
      ? Promise.resolve(null)
      : loadUserStatusSummary(guildId, session),
  ])

  return { adminBadges, userStatus }
}

async function loadUserStatusSummary(
  guildId: string,
  session: SessionPayload,
): Promise<UserStatusSummary | null> {
  if (!session.isMember) {
    return {
      displayName: session.username,
      balance: null,
      pendingCount: 0,
      pendingRegearCount: 0,
      pendingExchangeCount: 0,
      pendingDonationCount: 0,
      siphonBalance: null,
      siphonState: 'unavailable',
    }
  }

  const db = getAdminClient()
  const [avatarRes, identityGate, pointBalance, pendingCounts] = await Promise.all([
    db
      .from('guild_avatars')
      .select('username')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle(),
    getAlbionOnboardingGateState(session.discordId, guildId),
    getMemberPointBalance(db, guildId, session.discordId),
    getMemberPendingRequestCounts(db, guildId, session.discordId),
  ])

  const avatar = avatarRes.data as {
    username?: string | null
  } | null
  const siphonPlayer = resolveSiphonPlayer(identityGate)
  const displayName =
    identityGate.identity?.nickname?.trim() ||
    avatar?.username?.trim() ||
    session.username
  const balance = pointBalance.error ? 0 : pointBalance.balance
  const pendingRegearCount = pendingCounts.regear
  const pendingExchangeCount = pendingCounts.exchange
  const pendingDonationCount = pendingCounts.donation
  const siphon = await loadUserSiphonSummary(db, guildId, siphonPlayer)

  return {
    displayName,
    balance,
    pendingCount: pendingRegearCount + pendingExchangeCount + pendingDonationCount,
    pendingRegearCount,
    pendingExchangeCount,
    pendingDonationCount,
    siphonBalance: siphon.balance,
    siphonState: siphon.state,
  }
}

async function loadUserSiphonSummary(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  player: ReturnType<typeof resolveSiphonPlayer>,
): Promise<{ balance: number | null; state: UserStatusSiphonState }> {
  if (player.status === 'unverified') {
    return { balance: null, state: 'unverified' }
  }

  const operatingStart = await getLogOperatingStart('siphon', guildId)
  const result = await loadMemberSiphonAccount({
    db,
    guildId,
    player: player.player,
    operatingStart,
    recentLimit: 0,
  })

  if ('error' in result) {
    return { balance: null, state: 'unavailable' }
  }

  return { balance: result.account.net, state: 'ready' }
}
