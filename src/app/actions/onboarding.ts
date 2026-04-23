'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  searchPlayers,
  getPlayer,
  isAlbionServer,
  type AlbionServer,
  type GameinfoPlayer,
} from '@/lib/albion-gameinfo'
import { getMemberAlbionIdentity, type MemberAlbionIdentity } from '@/lib/albion-identity'

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
  const [identity, homeGuildId] = await Promise.all([
    getMemberAlbionIdentity(session.discordId),
    getAppSetting('albion_home_guild_id', ''),
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

  const homeGuildId = (await getAppSetting('albion_home_guild_id', '')).trim()
  const homeServer = (await getAppSetting('albion_server', '')).trim()
  const serverMatch = homeServer === input.server
  const guildMatch = Boolean(homeGuildId) && player.GuildId === homeGuildId
  const verified = serverMatch && guildMatch

  const updated = await upsertAlbionIdentity(session.discordId, {
    server: input.server,
    playerId: player.Id,
    nickname: player.Name,
    guildId: player.GuildId,
    verifiedAt: verified ? new Date().toISOString() : null,
  })
  if (updated.error) return { error: updated.error }

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

  const updated = await upsertAlbionIdentity(session.discordId, {
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

interface UpsertPayload {
  server: AlbionServer
  playerId: string | null
  nickname: string
  guildId: string | null
  verifiedAt: string | null
}

async function upsertAlbionIdentity(
  discordId: string,
  payload: UpsertPayload,
): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const db = getAdminClient()
  const { error } = await db
    .from('guild_avatars')
    .update({
      albion_server: payload.server,
      albion_player_id: payload.playerId,
      albion_nickname: payload.nickname,
      albion_guild_id: payload.guildId,
      albion_verified_at: payload.verifiedAt,
    })
    .eq('discord_id', discordId)
  if (error) {
    // (server, player_id) 유니크 제약 충돌 — 같은 알비온 캐릭터를 이미 다른
    // 디스코드 계정이 점유한 상태.
    if (error.code === '23505') return { error: tErr('albionIdentityTaken') }
    return { error: tErr('invalidInput') }
  }
  return { ok: true }
}
