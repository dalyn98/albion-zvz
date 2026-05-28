'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  searchPlayers,
  searchGuilds,
  getPlayer,
  isAlbionServer,
  type AlbionServer,
  type GameinfoPlayer,
} from '@/lib/albion-gameinfo'
import { requireAdmin } from '@/lib/auth'
import {
  getAlbionOnboardingGateState,
  type MemberAlbionIdentity,
} from '@/lib/albion-identity'
import { changeGuildMemberNickname } from '@/lib/discord'
import { log } from '@/lib/log'
import {
  canUseAllianceEventFeatures,
  canUseGuildResourceFeatures,
  getAccountAlbionIdentityView,
  recordAlbionIdentityClaim,
  refreshMemberAlbionIdentity,
} from '@/lib/account-albion-identity'

// 드롭다운에서 유저가 고르기 편하도록 정리한 후보 구조.
export interface AlbionPlayerCandidate {
  id: string
  name: string
  guildName: string | null
  allianceName: string | null
  killFame: number
}

export interface OnboardingState {
  identity: MemberAlbionIdentity | null
  allianceEventAllowed: boolean
  // 설정된 홈 길드가 있는지 — 비어 있으면 인증 자체가 불가능하므로 UI 에서
  // "관리자에게 홈 길드 설정 요청" 안내로 유도.
  homeGuildConfigured: boolean
}

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}

function isSafeShortInput(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !hasControlChars(value)
}

function revalidateAlbionIdentitySurfaces(discordId: string): void {
  revalidatePath('/me')
  revalidatePath('/me/profile')
  revalidatePath('/me/siphon')
  revalidatePath('/onboarding/albion')
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/dashboard/stats')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/', 'layout')
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const session = await getSession()
  if (!session) return { identity: null, allianceEventAllowed: false, homeGuildConfigured: false }
  const guildId = await getSessionGuildId(session)
  const [onboardingGate, homeGuildId] = await Promise.all([
    getAlbionOnboardingGateState(session.discordId, guildId),
    getAppSetting('albion_home_guild_id', '', guildId),
  ])
  return {
    identity: onboardingGate.identity,
    allianceEventAllowed: onboardingGate.allianceEventAllowed,
    homeGuildConfigured: homeGuildId.trim().length > 0,
  }
}

// Gameinfo /search 래핑. 세션 체크만 거치고 query/server 는 validate 후 그대로
// 넘긴다. 후보 10개.
export async function searchAlbionPlayerCandidates(
  serverRaw: string,
  query: string,
): Promise<{ candidates: AlbionPlayerCandidate[]; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { candidates: [], error: tErr('loginRequired') }
  if (!isAlbionServer(serverRaw)) return { candidates: [], error: tErr('invalidInput') }
  const trimmed = query.trim()
  if (!isSafeShortInput(trimmed, 32)) return { candidates: [], error: tErr('invalidInput') }
  const players = await searchPlayers(serverRaw, trimmed, 10)
  return { candidates: players.map(toCandidate) }
}

function toCandidate(p: GameinfoPlayer): AlbionPlayerCandidate {
  return {
    id: p.Id,
    name: p.Name,
    guildName: p.GuildName ?? null,
    allianceName: p.AllianceName ?? null,
    killFame: p.KillFame ?? 0,
  }
}

// 플레이어 선택 → Gameinfo 재조회 → 길드매칭 → 저장. 길드가 일치하면 인증,
// 아니면 identity 는 저장하되 verifiedAt=null 로 둔다 (수동입력과 동일 상태).
export async function confirmAlbionIdentity(input: {
  server: string
  playerId: string
}): Promise<{
  ok?: true
  verified?: boolean
  trusted?: boolean
  needsReview?: boolean
  allianceEventAllowed?: boolean
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!isAlbionServer(input.server)) return { error: tErr('invalidInput') }
  const playerId = input.playerId.trim()
  if (!isSafeShortInput(playerId, 80)) return { error: tErr('invalidInput') }

  const player = await getPlayer(input.server, playerId)
  if (!player) return { error: tErr('albionGameinfoUnavailable') }

  const sessionGuildId = await getSessionGuildId(session)
  const homeGuildId = (await getAppSetting('albion_home_guild_id', '', sessionGuildId)).trim()
  // albion_server 가 비어 있으면 ('') serverMatch 가 자동으로 false → 미인증으로 처리.
  // 'east' silent 폴백을 쓰면 west/eu tenant 가 East 사용자를 잘못 인증할 수 있다.
  const homeServer = (await getAppSetting('albion_server', '', sessionGuildId)).trim()
  const serverMatch = homeServer === input.server
  const guildMatch = Boolean(homeGuildId) && player.GuildId === homeGuildId
  const verified = serverMatch && guildMatch
  if (!verified) {
    // 관리자 진단용 로그 — 인증 실패 시 왜 실패했는지(서버 불일치/길드 ID 불일치)
    // 를 vercel logs 에서 바로 볼 수 있게 한다. player UUID 는 공개 정보.
    log.warn('[onboarding] verify failed', {
      tenant_id: sessionGuildId,
      discord_id: session.discordId,
      input_server: input.server,
      home_server: homeServer,
      server_match: serverMatch,
      player_guild_id: player.GuildId,
      player_guild_name: player.GuildName,
      home_guild_id: homeGuildId,
      guild_match: guildMatch,
    })
  }

  const currentAccount = await getAccountAlbionIdentityView(sessionGuildId, session.discordId)
  const keepTrusted =
    currentAccount?.trustStatus === 'trusted' &&
    currentAccount.playerId === player.Id &&
    currentAccount.server === input.server &&
    currentAccount.statusReason === 'legacy_trusted'
  const keepAdminApproved =
    currentAccount?.trustStatus === 'trusted' &&
    currentAccount.playerId === player.Id &&
    currentAccount.server === input.server &&
    currentAccount.statusReason === 'admin_approved'
  const accountClaim = await recordAlbionIdentityClaim({
    guildId: sessionGuildId,
    discordId: session.discordId,
    server: input.server,
    player,
    nickname: player.Name,
    legacyTrusted: keepTrusted,
    adminApprovedTrusted: keepAdminApproved,
    source: 'member_onboarding',
  })
  if (accountClaim.error) return { error: accountClaim.error }

  const accountModelAvailable = accountClaim.profileId !== null
  const resourceTrusted = accountModelAvailable
    ? canUseGuildResourceFeatures({
        relation: accountClaim.relation,
        trustStatus: accountClaim.trustStatus,
      })
    : verified
  const allianceEventAllowed = accountModelAvailable
    ? canUseAllianceEventFeatures({
        relation: accountClaim.relation,
        trustStatus: accountClaim.trustStatus,
      })
    : false
  const updated = await upsertAlbionIdentity(session.discordId, sessionGuildId, {
    server: input.server,
    playerId: player.Id,
    nickname: player.Name,
    guildId: player.GuildId,
    verifiedAt: resourceTrusted ? new Date().toISOString() : null,
    // 재화 기능까지 신뢰 승인된 경우에만 사이트 닉네임을 알비온 닉으로 동기화.
    // 검토 대기/미인증/수동 입력은 그대로 디스코드 이름을 유지한다.
    syncSiteUsername: resourceTrusted,
    fallbackUsername: session.username,
    fallbackAvatar: session.avatar,
  })
  if (updated.error) return { error: updated.error }

  // 인증 성공 시 디스코드 길드 닉네임도 알비온 닉으로 변경 시도. 봇 권한/역할
  // 순위로 실패할 수 있으므로 best-effort — 로그만 남기고 온보딩은 성공 반환.
  if (resourceTrusted) {
    try {
      const tenantConfig = await getTenantDiscordConfig(sessionGuildId)
      if (tenantConfig) {
        await changeGuildMemberNickname(tenantConfig.discordGuildId, session.discordId, player.Name)
      }
    } catch (e) {
      log.warn('[onboarding] discord nickname change failed', {
        tenant_id: sessionGuildId,
        discord_id: session.discordId,
        nickname: player.Name,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidateAlbionIdentitySurfaces(session.discordId)
  return {
    ok: true,
    verified,
    trusted: resourceTrusted,
    needsReview: verified && !resourceTrusted,
    allianceEventAllowed,
  }
}

// 수동 입력 플로우 (Gameinfo 에서 본인을 못 찾거나, 일부러 비인증으로 넘어가고
// 싶은 경우). 닉네임만 저장, player_id 는 null, 비인증.
export async function setAlbionIdentityManually(input: {
  server: string
  nickname: string
}): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!isAlbionServer(input.server)) return { error: tErr('invalidInput') }
  const nickname = input.nickname.trim()
  if (nickname.length < 2 || !isSafeShortInput(nickname, 32)) {
    return { error: tErr('invalidInput') }
  }

  const sessionGuildId = await getSessionGuildId(session)
  const accountClaim = await recordAlbionIdentityClaim({
    guildId: sessionGuildId,
    discordId: session.discordId,
    server: input.server,
    player: null,
    nickname,
    legacyTrusted: false,
    source: 'manual_entry',
  })
  if (accountClaim.error) return { error: accountClaim.error }

  const updated = await upsertAlbionIdentity(session.discordId, sessionGuildId, {
    server: input.server,
    playerId: null,
    nickname,
    guildId: null,
    verifiedAt: null,
    fallbackUsername: session.username,
    fallbackAvatar: session.avatar,
  })
  if (updated.error) return { error: updated.error }

  revalidateAlbionIdentitySurfaces(session.discordId)
  return { ok: true }
}

export async function refreshMyAlbionIdentity(): Promise<{
  ok?: true
  throttledUntil?: string
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  const result = await refreshMemberAlbionIdentity(guildId, session.discordId, { manual: true })
  if (result.throttledUntil) return { throttledUntil: result.throttledUntil }
  if (result.error === 'NO_LINKED_ALBION_PROFILE') return { error: tErr('albionVerificationRequired') }
  if (result.error === 'ALBION_GAMEINFO_UNAVAILABLE') return { error: tErr('albionGameinfoUnavailable') }
  if (result.error) return { error: result.error }
  return { ok: true }
}

// 관리자 전용: /admin/dashboard/settings 의 홈 길드 ID 입력 helper. 길드명을
// 받아 Gameinfo /search 로 후보 길드 리스트를 반환. 관리자가 후보 중 하나를
// 고르면 ID 가 자동 채워진다.
export interface AlbionGuildCandidate {
  id: string
  name: string
}

export async function searchAlbionGuildCandidates(
  serverRaw: string,
  query: string,
): Promise<{ candidates: AlbionGuildCandidate[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
  } catch {
    return { candidates: [], error: tErr('serverError') }
  }
  if (!isAlbionServer(serverRaw)) return { candidates: [], error: tErr('unknownSettingKey') }
  const guilds = await searchGuilds(serverRaw, query, 10)
  return { candidates: guilds.map((g) => ({ id: g.Id, name: g.Name })) }
}

interface UpsertPayload {
  server: AlbionServer
  playerId: string | null
  nickname: string
  guildId: string | null
  verifiedAt: string | null
  // true 면 guild_avatars.username 도 payload.nickname 으로 덮어씀. 인증 성공
  // 플로우에서만 설정되어 사이트 전역에서 알비온 닉으로 보이게 한다.
  syncSiteUsername?: boolean
  // INSERT 폴백용 — guild_avatars.username 은 NOT NULL 이라 행이 없을 때
  // 새로 삽입하려면 username 이 필요. OAuth callback 에서 row 를 생성하므로
  // 정상 멤버는 항상 row 가 있지만, 어떤 이유로든 row 가 누락된 경우(예:
  // 회원 탈퇴 후 재가입 race) 모달이 영원히 안 사라지는 사고를 방지.
  fallbackUsername: string
  fallbackAvatar: string | null
}

async function upsertAlbionIdentity(
  discordId: string,
  sessionGuildId: string,
  payload: UpsertPayload,
): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const db = getAdminClient()

  // 행이 있으면 update, 없으면 insert. PK 가 (guild_id, discord_id) 이므로
  // onConflict 로 안전한 upsert 가능. update-only 는 row 누락 시 silent no-op
  // 으로 모달이 풀리지 않는 사고를 만든다.
  const upsertRow: Record<string, string | null> = {
    guild_id: sessionGuildId,
    discord_id: discordId,
    username: payload.syncSiteUsername ? payload.nickname : payload.fallbackUsername,
    avatar: payload.fallbackAvatar,
    albion_server: payload.server,
    albion_player_id: payload.playerId,
    albion_nickname: payload.nickname,
    albion_guild_id: payload.guildId,
    albion_verified_at: payload.verifiedAt,
  }

  const { error } = await db
    .from('guild_avatars')
    .upsert(upsertRow, { onConflict: 'guild_id,discord_id' })
  if (error) {
    // (server, player_id) 유니크 제약 충돌 — 같은 알비온 캐릭터를 이미 다른
    // 디스코드 계정이 점유한 상태.
    if (error.code === '23505') return { error: tErr('albionIdentityTaken') }
    return { error: tErr('invalidInput') }
  }
  return { ok: true }
}
