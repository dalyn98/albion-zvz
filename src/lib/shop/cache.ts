import { revalidateTag, updateTag } from 'next/cache'

export const PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS = 30

export function publicShopCacheTag(guildId: string): string {
  return `public-shop:${guildId}`
}

export function revalidatePublicShopCache(guildId: string): void {
  updateTag(publicShopCacheTag(guildId))
}

export function markPublicShopCacheStale(guildId: string): void {
  revalidateTag(publicShopCacheTag(guildId), 'max')
}
