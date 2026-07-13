import { revalidateTag } from 'next/cache'

export const PUBLIC_GUILD_PROFILE_CACHE_REVALIDATE_SECONDS = 60

export function publicGuildProfileCacheTag(guildId: string): string {
  return `public-guild-profile:${guildId}`
}

// 사용자별 세션 데이터는 이 태그의 캐시에 절대 넣지 않는다. 공개 길드 데이터만
// stale-while-revalidate 방식으로 갱신해, 관리자가 편집한 결과가 즉시 다음 요청에
// 반영되도록 한다.
export function markPublicGuildProfileCacheStale(guildId: string): void {
  revalidateTag(publicGuildProfileCacheTag(guildId), 'max')
}
