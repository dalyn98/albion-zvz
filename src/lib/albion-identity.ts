// 알비온 identity 조회/판정 헬퍼. Server Actions 에서 페널티 게이트로 쓰고,
// onboarding 페이지가 현재 상태를 읽을 때도 쓴다.

import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  canUseAllianceEventFeatures,
  canUseGuildResourceFeatures,
  canUseManualRegearFeature,
  getAccountAlbionIdentityView,
  type AccountAlbionIdentityView,
  type AlbionIdentityRelation,
} from '@/lib/account-albion-identity'

export interface MemberAlbionIdentity {
  discordId: string
  server: AlbionServer | null
  playerId: string | null
  nickname: string | null
  guildId: string | null
  verifiedAt: string | null
}

export interface AlbionOnboardingGateState {
  identity: MemberAlbionIdentity | null
  hasStartedOnboarding: boolean
  siteAccessVerified: boolean
  resourceTrusted: boolean
  allianceEventAllowed: boolean
}

export interface AlbionEventAccessGateState {
  memberEventAccessAllowed: boolean
  memberEventVerificationRequired: boolean
  allianceEventAllowed: boolean
}

export interface ManualRegearGateResult {
  error: string | null
  relation: AlbionIdentityRelation
}

// guild_avatars 에서 알비온 identity 관련 컬럼만 꺼낸다. 로그인 직후 upsert
// 되는 행이므로 NULL 이 아닌 (guild_id, discord_id) 라면 항상 1건 존재.
// guildId 는 필수 — 한 discord_id 가 복수 테넌트에 속하면 discord_id 단독
// 조회는 .maybeSingle() 이 throw 하거나 엉뚱한 테넌트 레코드를 돌려준다.
export async function getMemberAlbionIdentity(
  discordId: string,
  guildId: string,
): Promise<MemberAlbionIdentity | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, albion_server, albion_player_id, albion_nickname, albion_guild_id, albion_verified_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (error || !data) return null
  return {
    discordId: data.discord_id,
    server: (data.albion_server ?? null) as AlbionServer | null,
    playerId: data.albion_player_id ?? null,
    nickname: data.albion_nickname ?? null,
    guildId: data.albion_guild_id ?? null,
    verifiedAt: data.albion_verified_at ?? null,
  }
}

export function isAlbionVerified(identity: MemberAlbionIdentity | null): boolean {
  return Boolean(identity?.verifiedAt)
}

function hasLegacyAlbionIdentity(identity: MemberAlbionIdentity | null): boolean {
  return Boolean(identity?.server || identity?.playerId || identity?.nickname)
}

function hasActiveAccountAlbionIdentity(
  identity: AccountAlbionIdentityView | null,
): identity is AccountAlbionIdentityView {
  if (!identity || identity.trustStatus === 'revoked') return false
  return Boolean(identity.server || identity.playerId || identity.nickname)
}

function accountToMemberIdentity(
  discordId: string,
  identity: AccountAlbionIdentityView | null,
): MemberAlbionIdentity | null {
  if (!hasActiveAccountAlbionIdentity(identity)) return null
  const resourceTrusted = canUseGuildResourceFeatures({
    relation: identity.relation,
    trustStatus: identity.trustStatus,
  })
  return {
    discordId,
    server: identity.server,
    playerId: identity.playerId,
    nickname: identity.nickname,
    guildId: identity.currentGuildId,
    verifiedAt: resourceTrusted ? (identity.trustedAt ?? identity.verifiedAt) : null,
  }
}

export function resolveAlbionOnboardingGate(input: {
  discordId: string
  legacyIdentity: MemberAlbionIdentity | null
  accountIdentity: AccountAlbionIdentityView | null
}): AlbionOnboardingGateState {
  const accountRevoked = input.accountIdentity?.trustStatus === 'revoked'
  const accountTrusted = input.accountIdentity
    ? canUseGuildResourceFeatures({
        relation: input.accountIdentity.relation,
        trustStatus: input.accountIdentity.trustStatus,
      })
    : false
  const allianceEventAllowed = input.accountIdentity
    ? canUseAllianceEventFeatures({
        relation: input.accountIdentity.relation,
        trustStatus: input.accountIdentity.trustStatus,
      })
    : false
  const accountIdentity = accountToMemberIdentity(input.discordId, input.accountIdentity)
  const hasLegacyIdentity = hasLegacyAlbionIdentity(input.legacyIdentity)
  const legacyVerified = isAlbionVerified(input.legacyIdentity)
  const resolvedIdentity = accountTrusted && accountIdentity
    ? accountIdentity
    : hasLegacyIdentity
      ? input.legacyIdentity
      : accountIdentity

  return {
    identity: accountRevoked ? null : resolvedIdentity,
    hasStartedOnboarding: accountRevoked ? false : hasLegacyIdentity || Boolean(accountIdentity),
    siteAccessVerified: accountRevoked ? false : accountTrusted || legacyVerified,
    resourceTrusted: input.accountIdentity ? accountTrusted : legacyVerified,
    allianceEventAllowed: accountRevoked ? false : allianceEventAllowed,
  }
}

export async function getAlbionOnboardingGateState(
  discordId: string,
  guildId: string,
): Promise<AlbionOnboardingGateState> {
  const [legacyIdentity, accountIdentity] = await Promise.all([
    getMemberAlbionIdentity(discordId, guildId),
    getAccountAlbionIdentityView(guildId, discordId),
  ])
  return resolveAlbionOnboardingGate({ discordId, legacyIdentity, accountIdentity })
}

export function resolveAlbionEventAccessGate(input: {
  onboardingGate: AlbionOnboardingGateState
  allowUnverifiedMemberAccess: boolean
  isMember: boolean
  isAdmin: boolean
}): AlbionEventAccessGateState {
  const memberEventVerificationRequired =
    input.isMember &&
    !input.isAdmin &&
    !input.allowUnverifiedMemberAccess &&
    !input.onboardingGate.siteAccessVerified

  return {
    memberEventAccessAllowed: !memberEventVerificationRequired,
    memberEventVerificationRequired,
    allianceEventAllowed: input.onboardingGate.allianceEventAllowed,
  }
}

export async function getAlbionEventAccessGateState(input: {
  discordId: string
  guildId: string
  isMember: boolean
  isAdmin: boolean
}): Promise<AlbionEventAccessGateState> {
  const shouldLoadMemberPolicy = input.isMember && !input.isAdmin
  const [onboardingGate, allowUnverifiedRaw] = await Promise.all([
    getAlbionOnboardingGateState(input.discordId, input.guildId),
    shouldLoadMemberPolicy
      ? getAppSetting('allow_unverified_member_access', 'true', input.guildId)
      : Promise.resolve('true'),
  ])

  return resolveAlbionEventAccessGate({
    onboardingGate,
    allowUnverifiedMemberAccess: allowUnverifiedRaw !== 'false',
    isMember: input.isMember,
    isAdmin: input.isAdmin,
  })
}

// 온보딩 첫 진입 여부 판단용. 서버를 한 번도 고르지 않았으면 true.
export function needsAlbionOnboarding(identity: MemberAlbionIdentity | null): boolean {
  return !identity?.server
}

export async function canUseAllianceEventFeaturesForSession(
  discordId: string,
  guildId: string,
): Promise<boolean> {
  const accountIdentity = await getAccountAlbionIdentityView(guildId, discordId)
  return accountIdentity
    ? canUseAllianceEventFeatures({
        relation: accountIdentity.relation,
        trustStatus: accountIdentity.trustStatus,
      })
    : false
}

// 페널티 게이트 헬퍼. 알비온 인증이 필요한 Server Action 앞에서 호출하고,
// 반환값이 null 이면 통과, 문자열이면 그대로 { error } 로 던진다.
//   const err = await requireAlbionVerified(session.discordId, guildId)
//   if (err) return { error: err }
export async function requireAlbionVerified(
  discordId: string,
  guildId: string,
): Promise<string | null> {
  const accountIdentity = await getAccountAlbionIdentityView(guildId, discordId)
  if (
    accountIdentity &&
    canUseGuildResourceFeatures({
      relation: accountIdentity.relation,
      trustStatus: accountIdentity.trustStatus,
    })
  ) {
    return null
  }
  if (accountIdentity) {
    const tErr = await getTranslations('memberActionError')
    return tErr('albionTrustedRequired')
  }

  // Compatibility fallback for deployments where migration 158/159 has not
  // been applied yet. Existing trusted members keep working until the account
  // identity tables are present and backfilled.
  const identity = await getMemberAlbionIdentity(discordId, guildId)
  if (isAlbionVerified(identity)) return null
  const tErr = await getTranslations('memberActionError')
  return tErr('albionVerificationRequired')
}

export async function requireManualRegearAllowed(
  discordId: string,
  guildId: string,
): Promise<ManualRegearGateResult> {
  const [accountIdentity, allianceRegearRaw] = await Promise.all([
    getAccountAlbionIdentityView(guildId, discordId),
    getAppSetting('alliance_regear_enabled', 'false', guildId),
  ])
  const allianceRegearEnabled = allianceRegearRaw === 'true'

  if (
    accountIdentity &&
    canUseManualRegearFeature({
      relation: accountIdentity.relation,
      trustStatus: accountIdentity.trustStatus,
      allianceRegearEnabled,
    })
  ) {
    return { error: null, relation: accountIdentity.relation }
  }
  if (accountIdentity) {
    const tErr = await getTranslations('memberActionError')
    const error = accountIdentity.relation === 'alliance' && !allianceRegearEnabled
      ? tErr('allianceRegearDisabled')
      : tErr('albionTrustedRequired')
    return { error, relation: accountIdentity.relation }
  }

  // Compatibility fallback for deployments where migration 158/159 has not
  // been applied yet. Existing trusted members keep working until the account
  // identity tables are present and backfilled.
  const identity = await getMemberAlbionIdentity(discordId, guildId)
  if (isAlbionVerified(identity)) return { error: null, relation: 'home_guild' }
  const tErr = await getTranslations('memberActionError')
  return { error: tErr('albionVerificationRequired'), relation: 'unknown' }
}
