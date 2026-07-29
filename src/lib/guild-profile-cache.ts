import { updateTag } from 'next/cache'

export const PUBLIC_GUILD_PROFILE_CACHE_REVALIDATE_SECONDS = 60

export function publicGuildProfileCacheTag(guildId: string): string {
  return `public-guild-profile:${guildId}`
}

// 사용자별 세션 데이터는 이 태그의 캐시에 절대 넣지 않는다. 공개 길드 데이터만
// 관리자가 섹션/프로필을 끈 직후의 다음 요청에서 이전 공개 응답을 재사용하면
// 개인정보가 잠시 남을 수 있다. 이 helper 는 Server Action 에서만 호출하며
// updateTag 로 즉시 만료해 write 이후 read-your-own-writes 를 보장한다.
export function markPublicGuildProfileCacheStale(guildId: string): void {
  updateTag(publicGuildProfileCacheTag(guildId))
}
