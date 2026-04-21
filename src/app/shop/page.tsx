import { ShoppingBag, Info, LogIn, Lock } from 'lucide-react'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { computePointPrice, parseSilverToPointRate } from '@/lib/shop/price'
import { getMyPointBalance, listMyShopOrders } from '@/app/actions/shop-member'
import ShopCatalog, { type CatalogItem } from '@/components/ShopCatalog'
import ShopMyOrders from '@/components/ShopMyOrders'

export const dynamic = 'force-dynamic'

export default async function PublicShopPage() {
  const session = await getSession()
  const db = getAdminClient()

  const [deliveryNotice, silverRateSetting, { data: invRows }] = await Promise.all([
    getAppSetting('shop_delivery_notice', ''),
    getAppSetting('shop_silver_to_point_rate', '1'),
    db
      .from('shop_inventory')
      .select(
        'id, unique_name, enchant, quality, stock, name_ko, tier, manual_price, auto_price_silver',
      )
      .gt('stock', 0)
      .order('tier', { ascending: false, nullsFirst: false })
      .order('name_ko', { ascending: true })
      .limit(500),
  ])

  const rate = parseSilverToPointRate(silverRateSetting)

  const items: CatalogItem[] = []
  for (const r of invRows ?? []) {
    const price = computePointPrice({
      manualPrice: r.manual_price as number | null,
      autoPriceSilver: r.auto_price_silver as number | null,
      silverToPointRate: rate,
    })
    if (price === null) continue // 가격 미정 아이템은 노출하지 않음
    items.push({
      id: r.id as string,
      uniqueName: r.unique_name as string,
      enchant: r.enchant as number,
      quality: r.quality as number,
      stock: r.stock as number,
      nameKo: r.name_ko as string,
      tier: (r.tier as number | null) ?? null,
      pointPrice: price,
    })
  }

  const balance = session ? await getMyPointBalance() : 0
  const orders = session ? await listMyShopOrders(20) : []
  const isMember = session?.isMember ?? false

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">길드 상점</h1>
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
            아이템을 주문하려면{' '}
            <Link
              href="/api/auth/discord/start?returnTo=%2Fshop"
              className="text-amber-300 underline"
            >
              Discord 로그인
            </Link>{' '}
            이 필요합니다.
          </p>
        </div>
      )}

      {session && !isMember && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-2">
          <Lock size={14} className="text-amber-400" />
          <p className="text-gray-300 text-xs">
            구경은 자유지만 주문은 길드원으로 인증된 계정만 가능합니다.
          </p>
        </div>
      )}

      {orders.length > 0 && <ShopMyOrders orders={orders} />}

      <ShopCatalog items={items} balance={balance} isMember={isMember} />
    </div>
  )
}
