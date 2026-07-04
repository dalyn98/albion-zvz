import { unstable_cache } from 'next/cache'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  loadPublicShopCatalogPageRows,
  type PublicShopCatalogPageInput,
  type PublicShopCatalogPageResult,
} from '@/lib/shop/inventory-queries'
import {
  PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
  publicShopCacheTag,
} from '@/lib/shop/cache'

export interface PublicShopSettings {
  discountRateSetting: string
  aodpCitiesSetting: string
  deliveryNotice: string
  deliveryNoticeImageUrl: string
  deliveryNoticeImageSizeRaw: string
}

function cachePart(value: unknown): string {
  if (Array.isArray(value)) return cachePart(value[0])
  if (value === null || value === undefined) return ''
  return String(value)
}

export async function loadCachedPublicShopSettings(guildId: string): Promise<PublicShopSettings> {
  const load = unstable_cache(
    async () => {
      const [
        discountRateSetting,
        aodpCitiesSetting,
        deliveryNotice,
        deliveryNoticeImageUrl,
        deliveryNoticeImageSizeRaw,
      ] = await Promise.all([
        getAppSetting('shop_discount_rate', '1', guildId),
        getAppSetting('aodp_cities', '', guildId),
        getAppSetting('shop_delivery_notice', '', guildId),
        getAppSetting('shop_delivery_notice_image_url', '', guildId),
        getAppSetting('shop_delivery_notice_image_size', 'full', guildId),
      ])
      return {
        discountRateSetting,
        aodpCitiesSetting,
        deliveryNotice,
        deliveryNoticeImageUrl,
        deliveryNoticeImageSizeRaw,
      }
    },
    ['public-shop-settings', guildId],
    {
      tags: [publicShopCacheTag(guildId)],
      revalidate: PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
    },
  )

  return load()
}

export async function loadCachedPublicShopCatalogPageRows(
  input: PublicShopCatalogPageInput,
): Promise<PublicShopCatalogPageResult> {
  const load = unstable_cache(
    async () =>
      loadPublicShopCatalogPageRows(getAdminClient(), input),
    [
      'public-shop-catalog-page',
      input.guildId,
      cachePart(input.page),
      cachePart(input.pageSize),
      cachePart(input.query),
      cachePart(input.tier),
      cachePart(input.sort),
    ],
    {
      tags: [publicShopCacheTag(input.guildId)],
      revalidate: PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
    },
  )

  return load()
}
