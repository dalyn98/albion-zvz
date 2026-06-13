import { ShoppingBag, LogIn, Lock } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { compareShopCatalogOrder } from '@/lib/shop/category-order'
import { AODP_ALLOWED_CITIES, type AodpCity } from '@/lib/shop/aodp-constants'
import { loadPublicShopCatalogPageRows } from '@/lib/shop/inventory-queries'
import {
  getShopPointBalanceForMember,
  listShopOrdersForMember,
} from '@/lib/shop/member-queries'
import ShopCatalog, {
  type CatalogItem,
  type ShopPriceWarning,
} from '@/components/ShopCatalog'
import ShopMyOrders from '@/components/ShopMyOrders'
import { getTenantTimezone } from '@/lib/timezone-server'
import DismissibleNoticeBanner from '@/components/DismissibleNoticeBanner'
import { normalizeNoticeImageSize } from '@/lib/notice-image-size'

// 관리자 설정에서 저장된 aodp_cities (JSON 배열) 에서 첫 항목을 꺼낸다. 파싱
// 실패하거나 허용된 도시가 아니면 기본값(카에르레온) 으로 폴백 — 관리자가
// 설정 전에도 /shop 이 깨지지 않게.
function parseBaseCity(raw: string): AodpCity {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      const first = parsed[0]
      if ((AODP_ALLOWED_CITIES as readonly string[]).includes(first)) {
        return first as AodpCity
      }
    }
  } catch {
    // ignore — fall through
  }
  return AODP_ALLOWED_CITIES[0]
}

export const dynamic = 'force-dynamic'

interface PublicShopPageProps {
  searchParams: Promise<{
    q?: string | string[]
    tier?: string | string[]
    page?: string | string[]
  }>
}

export default async function PublicShopPage({ searchParams }: PublicShopPageProps) {
  const catalogParams = await searchParams
  const session = await getSession()
  const db = getAdminClient()
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()

  const [
    tNav,
    tShop,
    deliveryNotice,
    deliveryNoticeImageUrl,
    deliveryNoticeImageSizeRaw,
    discountRateSetting,
    aodpCitiesSetting,
    tenantTimezone,
    inventoryResult,
    balance,
    orders,
  ] = await Promise.all([
    getTranslations('nav'),
    getTranslations('shopPublic'),
    getAppSetting('shop_delivery_notice', '', guildId),
    getAppSetting('shop_delivery_notice_image_url', '', guildId),
    getAppSetting('shop_delivery_notice_image_size', 'full', guildId),
    getAppSetting('shop_discount_rate', '1', guildId),
    getAppSetting('aodp_cities', '', guildId),
    getTenantTimezone(guildId),
    loadPublicShopCatalogPageRows(db, {
      guildId,
      page: catalogParams.page,
      query: catalogParams.q,
      tier: catalogParams.tier,
    }),
    session ? getShopPointBalanceForMember(db, guildId, session) : Promise.resolve(0),
    session ? listShopOrdersForMember(db, guildId, session.discordId, 20) : Promise.resolve([]),
  ])
  if (inventoryResult.error) {
    throw new Error(`Failed to load shop inventory: ${inventoryResult.error}`)
  }

  const discountRate = parseShopDiscountRate(discountRateSetting)
  const baseCity = parseBaseCity(aodpCitiesSetting)
  const deliveryNoticeImageSize = normalizeNoticeImageSize(deliveryNoticeImageSizeRaw)

  // 가격 계산 후 상점 공통 정렬을 적용한다. 가격 미정 재고도 견적 주문
  // 대상으로 노출한다.
  const items: CatalogItem[] = []
  for (const r of inventoryResult.rows) {
    const manualPrice = r.manual_price
    const price = computePointPrice({
      manualPrice,
      autoPriceSilver: r.auto_price_silver,
      discountRate,
    })
    // 수동 가격이 있으면 관리자가 확정한 값이라 AODP 경고를 숨긴다.
    const rawWarning = r.price_warning_level as ShopPriceWarning | null
    const priceWarning: ShopPriceWarning = manualPrice !== null ? null : rawWarning
    items.push({
      id: r.id,
      uniqueName: r.unique_name,
      enchant: r.enchant,
      quality: r.quality,
      stock: r.stock,
      nameKo: r.name_ko,
      category: r.category,
      tier: r.tier,
      pointPrice: price,
      priceWarning,
    })
  }
  items.sort(compareShopCatalogOrder)

  const isMember = session?.isMember ?? false

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('shop')}</h1>
      </div>

      <DismissibleNoticeBanner
        message={deliveryNotice}
        imageUrl={deliveryNoticeImageUrl}
        imageSize={deliveryNoticeImageSize}
      />

      {!session && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-2">
          <LogIn size={14} className="text-amber-400" />
          <p className="text-gray-300 text-xs">
            {tShop('loginRequiredPrefix')}
            <Link
              href="/api/auth/discord/start?returnTo=%2Fshop"
              className="text-amber-300 underline"
            >
              {tShop('loginLink')}
            </Link>
            {tShop('loginRequiredSuffix')}
          </p>
        </div>
      )}

      {session && !isMember && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-2">
          <Lock size={14} className="text-amber-400" />
          <p className="text-gray-300 text-xs">{tShop('memberOnly')}</p>
        </div>
      )}

      {orders.length > 0 && <ShopMyOrders orders={orders} timezone={tenantTimezone} />}

      <ShopCatalog
        items={items}
        balance={balance}
        isMember={isMember}
        baseCityLabel={baseCity}
        discountRate={discountRate}
        initialQuery={inventoryResult.query}
        initialTier={inventoryResult.tier ?? 'all'}
        serverPage={{
          page: inventoryResult.page,
          pageSize: inventoryResult.pageSize,
          total: inventoryResult.total,
          isTotalApproximate: inventoryResult.isTotalApproximate,
          hasMore: inventoryResult.hasMore,
        }}
      />
    </div>
  )
}
