import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
  loadPublicShopCatalogPageRows: vi.fn(),
  revalidateTag: vi.fn(),
  unstableCache: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: mocks.unstableCache,
  updateTag: mocks.updateTag,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/shop/inventory-queries', () => ({
  loadPublicShopCatalogPageRows: mocks.loadPublicShopCatalogPageRows,
}))

import {
  PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
  markPublicShopCacheStale,
  publicShopCacheTag,
  revalidatePublicShopCache,
} from './cache'
import {
  loadCachedPublicShopCatalogPageRows,
  loadCachedPublicShopSettings,
} from './public-catalog-cache'

beforeEach(() => {
  mocks.getAdminClient.mockReset()
  mocks.getAppSetting.mockReset()
  mocks.loadPublicShopCatalogPageRows.mockReset()
  mocks.revalidateTag.mockReset()
  mocks.unstableCache.mockReset()
  mocks.updateTag.mockReset()
  mocks.unstableCache.mockImplementation((fn: () => Promise<unknown>) => fn)
})

describe('public shop cache', () => {
  it('uses a tenant-scoped cache tag for explicit invalidation', () => {
    expect(publicShopCacheTag('guild-1')).toBe('public-shop:guild-1')

    revalidatePublicShopCache('guild-1')
    expect(mocks.updateTag).toHaveBeenCalledWith('public-shop:guild-1')

    markPublicShopCacheStale('guild-1')
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-shop:guild-1', 'max')
  })

  it('caches public shop settings under the tenant tag', async () => {
    mocks.getAppSetting.mockImplementation(
      async (key: string, fallback: string) => `${key}:${fallback}`,
    )

    const settings = await loadCachedPublicShopSettings('guild-1')

    expect(settings).toEqual({
      discountRateSetting: 'shop_discount_rate:1',
      aodpCitiesSetting: 'aodp_cities:',
      deliveryNotice: 'shop_delivery_notice:',
      deliveryNoticeImageUrl: 'shop_delivery_notice_image_url:',
      deliveryNoticeImageSizeRaw: 'shop_delivery_notice_image_size:full',
    })
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['public-shop-settings', 'guild-1'],
      {
        tags: ['public-shop:guild-1'],
        revalidate: PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
      },
    )
  })

  it('caches public catalog pages by tenant and filter inputs', async () => {
    const db = { from: vi.fn() }
    const input = {
      guildId: 'guild-1',
      page: ['2'],
      pageSize: 80,
      query: 'infernal',
      tier: '8',
      sort: 'type',
    }
    const result = {
      rows: [],
      page: 2,
      pageSize: 80,
      query: 'infernal',
      tier: 8,
      sort: 'type',
      total: 0,
      isTotalApproximate: false,
      hasMore: false,
    }
    mocks.getAdminClient.mockReturnValue(db)
    mocks.loadPublicShopCatalogPageRows.mockResolvedValue(result)

    await expect(loadCachedPublicShopCatalogPageRows(input)).resolves.toBe(result)

    expect(mocks.loadPublicShopCatalogPageRows).toHaveBeenCalledWith(db, input)
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['public-shop-catalog-page', 'guild-1', '2', '80', 'infernal', '8', 'type'],
      {
        tags: ['public-shop:guild-1'],
        revalidate: PUBLIC_SHOP_CACHE_REVALIDATE_SECONDS,
      },
    )
  })
})
