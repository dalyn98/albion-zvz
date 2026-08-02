import 'server-only'

import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import {
  canUseAllianceEventFeaturesForSession,
  getAlbionOnboardingGateState,
} from '@/lib/albion-identity'
import { getLogOperatingStart } from '@/lib/log-operating-start-server'
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
import { getAppSetting } from '@/lib/app-settings'
import { parseSiphonAccountingMode, siphonActivityTotal } from '@/lib/siphon/accounting-mode'
import {
  isGuildFeatureDiscoverable,
  isGuildFeatureQueueDiscoverable,
  type GuildFeatureSnapshot,
} from '@/lib/guild-features'
import { loadGuildFeatureSnapshot } from '@/lib/guild-features-server'
import { loadMemberWorkInboxSnapshot } from '@/lib/member-work-inbox-server'

export interface AppShellStatusPayload {
  adminBadges: AdminBadgeCounts | null
  userStatus: UserStatusSummary | null
}

export async function loadAppShellStatus(
  guildId: string,
  session: SessionPayload,
): Promise<AppShellStatusPayload> {
  const featureSnapshot = await loadGuildFeatureSnapshot(guildId)
  const canReviewQueues = session.isAdmin || sessionHasAny(session, [
    CAP.REGEAR_APPROVE,
    CAP.REGEAR_EDIT_PRICE,
    CAP.REGEAR_BULK_ACTION,
    CAP.EXCHANGE_APPROVE,
    CAP.DONATION_APPROVE,
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

  const [rawAdminBadges, userStatus] = await Promise.all([
    canReviewQueues ? getAdminBadgeCounts(guildId) : Promise.resolve(null),
    isBombSquadCallerOnly || isAllianceEventOnly || isAllianceCandidateOnly
      ? Promise.resolve(null)
      : loadUserStatusSummary(guildId, session, featureSnapshot),
  ])

  const adminBadges = rawAdminBadges
    ? filterAdminBadges(rawAdminBadges, featureSnapshot)
    : null

  return { adminBadges, userStatus }
}

function filterAdminBadges(
  badges: AdminBadgeCounts,
  snapshot: GuildFeatureSnapshot,
): AdminBadgeCounts {
  return {
    regear: isGuildFeatureQueueDiscoverable(snapshot, 'regear') ? badges.regear : 0,
    exchange: isGuildFeatureQueueDiscoverable(snapshot, 'exchange') ? badges.exchange : 0,
    donation: isGuildFeatureQueueDiscoverable(snapshot, 'donation') ? badges.donation : 0,
    shop: isGuildFeatureQueueDiscoverable(snapshot, 'shop') ? badges.shop : 0,
    memberTrade: isGuildFeatureQueueDiscoverable(snapshot, 'memberTrade')
      ? badges.memberTrade
      : 0,
    eventPayout: isGuildFeatureQueueDiscoverable(snapshot, 'eventPayout')
      ? badges.eventPayout
      : 0,
    craft: isGuildFeatureQueueDiscoverable(snapshot, 'craft') ? badges.craft : 0,
  }
}

async function loadUserStatusSummary(
  guildId: string,
  session: SessionPayload,
  featureSnapshot: GuildFeatureSnapshot,
): Promise<UserStatusSummary | null> {
  if (!session.isMember) {
    return {
      displayName: session.username,
      balance: null,
      pendingCount: 0,
      pendingRegearCount: 0,
      pendingExchangeCount: 0,
      pendingDonationCount: 0,
      pendingOtherCount: 0,
      siphonBalance: null,
      siphonState: 'unavailable',
      pointsVisible: false,
      siphonVisible: false,
    }
  }

  const db = getAdminClient()
  const pointsVisible = isGuildFeatureDiscoverable(
    featureSnapshot.guild_economy.state,
  )
  const supplyVisible = isGuildFeatureDiscoverable(featureSnapshot.supply.state)
  const siphonVisible = isGuildFeatureDiscoverable(
    featureSnapshot.asset_accounting.state,
  )
  const [avatarRes, identityGate, pointBalance, memberWorkInbox] = await Promise.all([
    db
      .from('guild_avatars')
      .select('username')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle(),
    getAlbionOnboardingGateState(session.discordId, guildId),
    pointsVisible
      ? getMemberPointBalance(db, guildId, session.discordId)
      : Promise.resolve(null),
    loadMemberWorkInboxSnapshot(db, guildId, session.discordId, {
      includeHistory: false,
      historyLimit: 0,
    }),
  ])

  const avatar = avatarRes.data as {
    username?: string | null
  } | null
  const siphonPlayer = resolveSiphonPlayer(identityGate)
  const displayName =
    identityGate.identity?.nickname?.trim() ||
    avatar?.username?.trim() ||
    session.username
  const balance = !pointBalance
    ? null
    : pointBalance.error
      ? 0
      : pointBalance.balance
  const pendingRegearCount = supplyVisible
    ? memberWorkInbox.activeCountsByDomain.regear +
      memberWorkInbox.activeCountsByDomain.craft
    : 0
  const pendingExchangeCount = pointsVisible
    ? memberWorkInbox.activeCountsByDomain.exchange
    : 0
  const pendingDonationCount = pointsVisible
    ? memberWorkInbox.activeCountsByDomain.donation +
      memberWorkInbox.activeCountsByDomain.treasury_deposit
    : 0
  const pendingOtherCount =
    memberWorkInbox.activeCountsByDomain.shop +
    memberWorkInbox.activeCountsByDomain.member_trade
  const siphon = siphonVisible
    ? await loadUserSiphonSummary(db, guildId, siphonPlayer)
    : { balance: null, state: 'unavailable' as const }

  return {
    displayName,
    balance,
    pendingCount: memberWorkInbox.activeCount,
    pendingRegearCount,
    pendingExchangeCount,
    pendingDonationCount,
    pendingOtherCount,
    siphonBalance: siphon.balance,
    siphonState: siphon.state,
    pointsVisible,
    siphonVisible,
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
  const mode = parseSiphonAccountingMode(
    await getAppSetting('siphon_accounting_mode', 'personal_custody', guildId),
  )
  if (mode === 'record') {
    return { balance: siphonActivityTotal(result.account), state: 'record' }
  }
  return { balance: result.account.net, state: 'ready' }
}
