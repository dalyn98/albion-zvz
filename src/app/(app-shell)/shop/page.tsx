import { ShoppingBag, LogIn, Lock } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { compareShopCatalogOrder } from '@/lib/shop/category-order'
import { AODP_ALLOWED_CITIES, type AodpCity } from '@/lib/shop/aodp-constants'
import {
  getShopPointBalanceForMember,
  listShopOrdersForMember,
} from '@/lib/shop/member-queries'
import {
  loadCachedPublicShopCatalogPageRows,
  loadCachedPublicShopSettings,
  type PublicShopSettings,
} from '@/lib/shop/public-catalog-cache'
import ShopCatalog, {
  type CatalogItem,
  type ShopPriceWarning,
} from '@/components/ShopCatalog'
import ShopMyOrders from '@/components/ShopMyOrders'
import { getTenantTimezone } from '@/lib/timezone-server'
import DismissibleNoticeBanner from '@/components/DismissibleNoticeBanner'
import { normalizeNoticeImageSize } from '@/lib/notice-image-size'
import { getLocalizedItemName, stripLocalizedTierName } from '@/lib/item-names'
import { isLocale, type Locale } from '@/i18n/locales'
import MemberEconomyNav from '@/components/MemberEconomyNav'
import { buildLoginEntryHref, buildReturnToWithSearchParams } from '@/lib/login-entry'

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

type ShopSession = Awaited<ReturnType<typeof getSession>>
type CatalogSearchParams = {
  q?: string | string[]
  tier?: string | string[]
  sort?: string | string[]
  page?: string | string[]
}

interface PublicShopPageProps {
  searchParams: Promise<CatalogSearchParams>
}

export default async function PublicShopPage({ searchParams }: PublicShopPageProps) {
  const [catalogParams, session] = await Promise.all([searchParams, getSession()])
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()

  const [tNav, tShop, shopSettings] = await Promise.all([
    getTranslations('nav'),
    getTranslations('shopPublic'),
    loadCachedPublicShopSettings(guildId),
  ])
  const visualRefreshEnabled = true
  const deliveryNoticeImageSize = normalizeNoticeImageSize(shopSettings.deliveryNoticeImageSizeRaw)
  const isMember = session?.isMember ?? false
  const loginReturnParams = new URLSearchParams()
  for (const [key, rawValue] of Object.entries(catalogParams)) {
    const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []
    for (const value of values) loginReturnParams.append(key, value)
  }
  const loginHref = buildLoginEntryHref({
    returnTo: buildReturnToWithSearchParams('/shop', loginReturnParams),
  })

  return (
    <main className="v3-shop-workspace mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('shop')}</h1>
      </div>

      <MemberEconomyNav
        active="shop"
        ariaLabel={tNav('economy')}
        labels={{
          wallet: tNav('wallet'),
          shop: tNav('shop'),
          market: tNav('memberMarket'),
        }}
      />

      <DismissibleNoticeBanner
        message={shopSettings.deliveryNotice}
        imageUrl={shopSettings.deliveryNoticeImageUrl}
        imageSize={deliveryNoticeImageSize}
      />

      {!session && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-2">
          <LogIn size={14} className="text-amber-400" />
          <p className="text-gray-300 text-xs">
            {tShop('loginRequiredPrefix')}
            <Link
              href={loginHref}
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

      <Suspense fallback={<ShopStorefrontSkeleton />}>
        <ShopStorefrontContent
          catalogParams={catalogParams}
          guildId={guildId}
          session={session}
          shopSettings={shopSettings}
          visualRefreshEnabled={visualRefreshEnabled}
        />
      </Suspense>
    </main>
  )
}

async function ShopStorefrontContent({
  catalogParams,
  guildId,
  session,
  shopSettings,
  visualRefreshEnabled,
}: {
  catalogParams: CatalogSearchParams
  guildId: string
  session: ShopSession
  shopSettings: PublicShopSettings
  visualRefreshEnabled: boolean
}) {
  const db = getAdminClient()
  const [
    tenantTimezone,
    inventoryResult,
    balance,
    orders,
    localeRaw,
  ] = await Promise.all([
    getTenantTimezone(guildId),
    loadCachedPublicShopCatalogPageRows({
      guildId,
      page: catalogParams.page,
      query: catalogParams.q,
      tier: catalogParams.tier,
      sort: catalogParams.sort,
    }),
    session ? getShopPointBalanceForMember(db, guildId, session) : Promise.resolve(0),
    session ? listShopOrdersForMember(db, guildId, session.discordId, 20) : Promise.resolve([]),
    getLocale(),
  ])
  if (inventoryResult.error) {
    throw new Error(`Failed to load shop inventory: ${inventoryResult.error}`)
  }

  const locale: Locale = isLocale(localeRaw) ? localeRaw : 'ko'
  const discountRate = parseShopDiscountRate(shopSettings.discountRateSetting)
  const baseCity = parseBaseCity(shopSettings.aodpCitiesSetting)

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
    const localizedName = getLocalizedItemName(r.unique_name, locale, r.name_ko) ?? r.name_ko
    const displayName = stripLocalizedTierName(localizedName, locale) || localizedName
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
      displayName,
      localizedName,
      originalName: r.name_ko,
    })
  }
  items.sort((a, b) => compareShopCatalogOrder(a, b, inventoryResult.sort))
  const isMember = session?.isMember ?? false
  const localizedOrders = orders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      nameKo: getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo,
    })),
  }))

  return (
    <>
      {localizedOrders.length > 0 && (
        <ShopMyOrders
          orders={localizedOrders}
          timezone={tenantTimezone}
          visualRefreshEnabled={visualRefreshEnabled}
        />
      )}

      <ShopCatalog
        items={items}
        balance={balance}
        isMember={isMember}
        baseCityLabel={baseCity}
        discountRate={discountRate}
        initialQuery={inventoryResult.query}
        initialTier={inventoryResult.tier ?? 'all'}
        initialSort={inventoryResult.sort}
        serverPage={{
          page: inventoryResult.page,
          pageSize: inventoryResult.pageSize,
          total: inventoryResult.total,
          isTotalApproximate: inventoryResult.isTotalApproximate,
          hasMore: inventoryResult.hasMore,
        }}
        visualRefreshEnabled={visualRefreshEnabled}
      />
    </>
  )
}

function ShopStorefrontSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div className="h-9 w-48 rounded-lg bg-gray-800" />
        <div className="h-9 w-32 rounded-lg bg-gray-800" />
      </div>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-800 bg-gray-900 p-3"
          >
            <div className="h-20 rounded-lg bg-gray-800" />
            <div className="mt-3 h-3 w-3/4 rounded bg-gray-800" />
            <div className="mt-2 h-3 w-1/2 rounded bg-gray-800" />
          </div>
        ))}
      </section>
    </div>
  )
}
