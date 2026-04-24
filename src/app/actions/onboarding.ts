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
import { getMemberAlbionIdentity, type MemberAlbionIdentity } from '@/lib/albion-identity'
import { changeGuildMemberNickname } from '@/lib/discord'

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
  // 설정된 홈 길드가 있는지 — 비어 있으면 인증 자체가 불가능하므로 UI 에서
  // "관리자에게 홈 길드 설정 요청" 안내로 유도.
  homeGuildConfigured: boolean
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const session = await getSession()
  if (!session) return { identity: null, homeGuildConfigured: false }
  const guildId = await getSessionGuildId(session)
  const [identity, homeGuildId] = await Promise.all([
    getMemberAlbionIdentity(session.discordId),
    getAppSetting('albion_home_guild_id', '', guildId),
  ])
  return {
    identity,
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
  const players = await searchPlayers(serverRaw, query, 10)
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
}): Promise<{ ok?: true; verified?: boolean; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!isAlbionServer(input.server)) return { error: tErr('invalidInput') }
  const playerId = input.playerId.trim()
  if (!playerId) return { error: tErr('invalidInput') }

  const player = await getPlayer(input.server, playerId)
  if (!player) return { error: tErr('albionGameinfoUnavailable') }

  const sessionGuildId = await getSessionGuildId(session)
  const homeGuildId = (await getAppSetting('albion_home_guild_id', '', sessionGuildId)).trim()
  // fallback 'east' — 설정 페이지/killboard/AODP 전부 'east' fallback 을 쓰므로
  // 온보딩도 같은 기본값을 써야 관리자가 "UI 에 East 로 보여서 저장 안 했는데
  // 실제 DB 에는 row 가 없어 인증이 항상 실패" 하는 상태가 안 된다.
  const homeServer = (await getAppSetting('albion_server', 'east', sessionGuildId)).trim()
  const serverMatch = homeServer === input.server
  const guildMatch = Boolean(homeGuildId) && player.GuildId === homeGuildId
  const verified = serverMatch && guildMatch
  if (!verified) {
    // 관리자 진단용 로그 — 인증 실패 시 왜 실패했는지(서버 불일치/길드 ID 불일치)
    // 를 vercel logs 에서 바로 볼 수 있게 한다. player UUID 는 공개 정보.
    console.warn('[onboarding] verify failed', {
      discordId: session.discordId,
      inputServer: input.server,
      homeServer,
      serverMatch,
      playerGuildId: player.GuildId,
      playerGuildName: player.GuildName,
      homeGuildId,
      guildMatch,
    })
  }

  const updated = await upsertAlbionIdentity(session.discordId, sessionGuildId, {
    server: input.server,
    playerId: player.Id,
    nickname: player.Name,
    guildId: player.GuildId,
    verifiedAt: verified ? new Date().toISOString() : null,
    // 인증된 경우에만 사이트 닉네임을 알비온 닉으로 동기화. 미인증/수동 입력은
    // 그대로 디스코드 이름을 유지한다.
    syncSiteUsername: verified,
  })
  if (updated.error) return { error: updated.error }

  // 인증 성공 시 디스코드 길드 닉네임도 알비온 닉으로 변경 시도. 봇 권한/역할
  // 순위로 실패할 수 있으므로 best-effort — 로그만 남기고 온보딩은 성공 반환.
  if (verified) {
    try {
      const tenantConfig = await getTenantDiscordConfig(sessionGuildId)
      if (tenantConfig) {
        await changeGuildMemberNickname(tenantConfig.discordGuildId, session.discordId, player.Name)
      }
    } catch (e) {
      console.warn('[onboarding] discord nickname change failed', e)
    }
  }

  revalidatePath('/me')
  revalidatePath('/onboarding/albion')
  return { ok: true, verified }
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
  if (nickname.length < 2 || nickname.length > 32) return { error: tErr('invalidInput') }

  const sessionGuildId = await getSessionGuildId(session)
  const updated = await upsertAlbionIdentity(session.discordId, sessionGuildId, {
    server: input.server,
    playerId: null,
    nickname,
    guildId: null,
    verifiedAt: null,
  })
  if (updated.error) return { error: updated.error }

  revalidatePath('/me')
  revalidatePath('/onboarding/albion')
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
}

async function upsertAlbionIdentity(
  discordId: string,
  sessionGuildId: string,
  payload: UpsertPayload,
): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const db = getAdminClient()
  const update: Record<string, string | null> = {
    albion_server: payload.server,
    albion_player_id: payload.playerId,
    albion_nickname: payload.nickname,
    albion_guild_id: payload.guildId,
    albion_verified_at: payload.verifiedAt,
  }
  if (payload.syncSiteUsername) {
    update.username = payload.nickname
  }
  const { error } = await db
    .from('guild_avatars')
    .update(update)
    .eq('guild_id', sessionGuildId)
    .eq('discord_id', discordId)
  if (error) {
    // (server, player_id) 유니크 제약 충돌 — 같은 알비온 캐릭터를 이미 다른
    // 디스코드 계정이 점유한 상태.
    if (error.code === '23505') return { error: tErr('albionIdentityTaken') }
    return { error: tErr('invalidInput') }
  }
  return { ok: true }
}
