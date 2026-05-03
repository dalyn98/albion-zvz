import { ShoppingBag, Info, LogIn, Lock } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { categoryRank } from '@/lib/shop/category-order'
import { getMyPointBalance, listMyShopOrders } from '@/app/actions/shop-member'
import { AODP_ALLOWED_CITIES, type AodpCity } from '@/lib/shop/aodp-constants'
import ShopCatalog, {
  type CatalogItem,
  type ShopPriceWarning,
} from '@/components/ShopCatalog'
import ShopMyOrders from '@/components/ShopMyOrders'

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

export default async function PublicShopPage() {
  const session = await getSession()
  const db = getAdminClient()
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()

  const [tNav, tShop, deliveryNotice, discountRateSetting, aodpCitiesSetting, { data: invRows }] =
    await Promise.all([
      getTranslations('nav'),
      getTranslations('shopPublic'),
      getAppSetting('shop_delivery_notice', '', guildId),
      getAppSetting('shop_discount_rate', '1', guildId),
      getAppSetting('aodp_cities', '', guildId),
      db
        .from('shop_inventory')
        .select(
          'id, unique_name, enchant, quality, stock, name_ko, category, tier, manual_price, auto_price_silver, price_warning_level',
        )
        .eq('guild_id', guildId)
        .gt('stock', 0)
        .order('name_ko', { ascending: true })
        .limit(500),
    ])

  const discountRate = parseShopDiscountRate(discountRateSetting)
  const baseCity = parseBaseCity(aodpCitiesSetting)

  // 가격 계산 후 카테고리 → 이름 순으로 안정 정렬. DB 가 name_ko asc 로 반환하므로
  // 카테고리 랭크만 비교하면 동일 카테고리 내 이름순이 자동 유지된다.
  const items: CatalogItem[] = []
  for (const r of invRows ?? []) {
    const manualPrice = r.manual_price as number | null
    const price = computePointPrice({
      manualPrice,
      autoPriceSilver: r.auto_price_silver as number | null,
      discountRate,
    })
    if (price === null) continue // 가격 미정 아이템은 노출하지 않음
    // 수동 가격이 있으면 관리자가 확정한 값이라 AODP 경고를 숨긴다.
    const rawWarning = r.price_warning_level as ShopPriceWarning | null
    const priceWarning: ShopPriceWarning = manualPrice !== null ? null : rawWarning
    items.push({
      id: r.id as string,
      uniqueName: r.unique_name as string,
      enchant: r.enchant as number,
      quality: r.quality as number,
      stock: r.stock as number,
      nameKo: r.name_ko as string,
      category: (r.category as string | null) ?? null,
      tier: (r.tier as number | null) ?? null,
      pointPrice: price,
      priceWarning,
    })
  }
  items.sort((a, b) => categoryRank(a.category) - categoryRank(b.category))

  const balance = session ? await getMyPointBalance() : 0
  const orders = session ? await listMyShopOrders(20) : []
  const isMember = session?.isMember ?? false

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('shop')}</h1>
      </div>

      {deliveryNotice && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-2">
          <Info size={14} className="text-amber-300 mt-0.5 shrink-0" />
          <p className="text-amber-100/90 text-xs whitespace-pre-wrap">{deliveryNotice}</p>
        </div>
      )}

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

      {orders.length > 0 && <ShopMyOrders orders={orders} />}

      <ShopCatalog
        items={items}
        balance={balance}
        isMember={isMember}
        baseCityLabel={baseCity}
      />
    </div>
  )
}
