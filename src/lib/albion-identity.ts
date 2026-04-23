// 알비온 identity 조회/판정 헬퍼. Server Actions 에서 페널티 게이트로 쓰고,
// onboarding 페이지가 현재 상태를 읽을 때도 쓴다.

import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import type { AlbionServer } from '@/lib/albion-gameinfo'

export interface MemberAlbionIdentity {
  discordId: string
  server: AlbionServer | null
  playerId: string | null
  nickname: string | null
  guildId: string | null
  verifiedAt: string | null
}

// guild_avatars 에서 알비온 identity 관련 컬럼만 꺼낸다. 로그인 직후 upsert
// 되는 행이므로 NULL 이 아닌 discord_id 라면 항상 1건 존재.
export async function getMemberAlbionIdentity(discordId: string): Promise<MemberAlbionIdentity | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, albion_server, albion_player_id, albion_nickname, albion_guild_id, albion_verified_at')
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

// 온보딩 첫 진입 여부 판단용. 서버를 한 번도 고르지 않았으면 true.
export function needsAlbionOnboarding(identity: MemberAlbionIdentity | null): boolean {
  return !identity?.server
}

// 페널티 게이트 헬퍼. 알비온 인증이 필요한 Server Action 앞에서 호출하고,
// 반환값이 null 이면 통과, 문자열이면 그대로 { error } 로 던진다.
//   const err = await requireAlbionVerified(session.discordId)
//   if (err) return { error: err }
export async function requireAlbionVerified(discordId: string): Promise<string | null> {
  const identity = await getMemberAlbionIdentity(discordId)
  if (isAlbionVerified(identity)) return null
  const tErr = await getTranslations('memberActionError')
  return tErr('albionVerificationRequired')
}
