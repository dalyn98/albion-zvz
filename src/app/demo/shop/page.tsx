import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import {
  History,
  Info,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'

// 실 /shop 의 비주얼 클론 — 카탈로그 그리드 + 잔액 + 장바구니 사이드바 + 내 주문
// 패널. ShopCatalog 는 'use client' 라 재사용 대신 SSR 로 정적 마크업을 그렸다.
// 모든 버튼은 DemoActionButton — 토스트로 "데모용 작업이라 저장되지 않아요" 안내.

const BALANCE = 4280

type DemoCatalogItem = {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  tier: number
  pointPrice: number
  priceWarning: 'quality' | 'window' | 'bluezone' | null
}

// 5장의 best-seller (상단) + T8 e3 q3 보조 장비들 — 카탈로그가 짧으면 데모가
// 빈약해 보여 12장으로 채운다. T7 도 한두 장 섞어 "여러 티어가 있다" 는 인상.
const DEMO_CATALOG: ReadonlyArray<DemoCatalogItem> = [
  { id: '1', uniqueName: 'T8_2H_MACE_HEAVY', enchant: 3, quality: 3, stock: 12, nameKo: 'Heavy Mace', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '2', uniqueName: 'T8_2H_HOLYSTAFF_AVALON', enchant: 3, quality: 3, stock: 8, nameKo: 'Holy Staff', tier: 8, pointPrice: 80, priceWarning: 'quality' },
  { id: '3', uniqueName: 'T8_2H_DAGGERPAIR', enchant: 3, quality: 3, stock: 6, nameKo: 'Dagger Pair', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '4', uniqueName: 'T8_2H_FIRESTAFF', enchant: 3, quality: 3, stock: 4, nameKo: 'Great Fire Staff', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '5', uniqueName: 'T8_2H_CROSSBOWLARGE', enchant: 3, quality: 3, stock: 5, nameKo: 'Heavy Crossbow', tier: 8, pointPrice: 80, priceWarning: 'window' },
  { id: '6', uniqueName: 'T8_HEAD_PLATE_SET1', enchant: 3, quality: 3, stock: 14, nameKo: 'Guardian Helmet', tier: 8, pointPrice: 32, priceWarning: null },
  { id: '7', uniqueName: 'T8_ARMOR_PLATE_SET1', enchant: 3, quality: 3, stock: 11, nameKo: 'Guardian Armor', tier: 8, pointPrice: 48, priceWarning: null },
  { id: '8', uniqueName: 'T8_SHOES_PLATE_SET1', enchant: 3, quality: 3, stock: 13, nameKo: 'Guardian Boots', tier: 8, pointPrice: 32, priceWarning: null },
  { id: '9', uniqueName: 'T8_OFF_SHIELD', enchant: 3, quality: 3, stock: 7, nameKo: 'Stalwart Shield', tier: 8, pointPrice: 36, priceWarning: 'bluezone' },
  { id: '10', uniqueName: 'T8_CAPE', enchant: 3, quality: 3, stock: 22, nameKo: 'Cape', tier: 8, pointPrice: 24, priceWarning: null },
  { id: '11', uniqueName: 'T7_2H_MACE_HEAVY', enchant: 2, quality: 3, stock: 18, nameKo: 'Heavy Mace', tier: 7, pointPrice: 40, priceWarning: null },
  { id: '12', uniqueName: 'T7_2H_HOLYSTAFF', enchant: 2, quality: 3, stock: 9, nameKo: 'Holy Staff', tier: 7, pointPrice: 38, priceWarning: null },
]

// 장바구니 — 미리 2개 담아둔 상태로 보여줘서 "장바구니가 어떻게 보이는지" 가
// 1초만에 전달되도록 한다. 빈 카트보다 훨씬 강한 first impression.
type CartLine = { itemId: string; qty: number }
const DEMO_CART: ReadonlyArray<CartLine> = [
  { itemId: '6', qty: 1 }, // Guardian Helmet
  { itemId: '7', qty: 1 }, // Guardian Armor
]

type OrderStatus = 'pending' | 'approved' | 'rejected'
type DemoOrder = {
  id: string
  status: OrderStatus
  whenLabel: string
  items: ReadonlyArray<{ uniqueName: string; enchant: number; quality: number; nameKo: string; qty: number }>
  totalPoints: number
}

const DEMO_ORDERS: ReadonlyArray<DemoOrder> = [
  {
    id: 'ord-3',
    status: 'pending',
    whenLabel: 'Today 18:24',
    items: [
      { uniqueName: 'T8_2H_MACE_HEAVY', enchant: 3, quality: 3, nameKo: 'Heavy Mace', qty: 1 },
      { uniqueName: 'T8_OFF_SHIELD', enchant: 3, quality: 3, nameKo: 'Stalwart Shield', qty: 1 },
    ],
    totalPoints: 116,
  },
  {
    id: 'ord-2',
    status: 'approved',
    whenLabel: 'Yesterday 21:10',
    items: [
      { uniqueName: 'T8_HEAD_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Helmet', qty: 1 },
      { uniqueName: 'T8_ARMOR_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Armor', qty: 1 },
      { uniqueName: 'T8_SHOES_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Boots', qty: 1 },
    ],
    totalPoints: 112,
  },
  {
    id: 'ord-1',
    status: 'rejected',
    whenLabel: '3d ago 22:30',
    items: [{ uniqueName: 'T8_2H_FIRESTAFF', enchant: 3, quality: 3, nameKo: 'Great Fire Staff', qty: 2 }],
    totalPoints: 160,
  },
]

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
}

const STATUS_LABEL_KEY: Record<OrderStatus, 'statusPending' | 'statusApproved' | 'statusRejected'> = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
}

const QUALITY_RING: Record<number, string> = {
  1: 'ring-gray-500/60',
  2: 'ring-sky-300/70',
  3: 'ring-blue-400/80',
  4: 'ring-purple-400/80',
  5: 'ring-amber-300/90',
}

const PRICE_WARNING_COLOR: Record<NonNullable<DemoCatalogItem['priceWarning']>, string> = {
  quality: 'bg-yellow-400 text-black',
  window: 'bg-yellow-400 text-black',
  bluezone: 'bg-orange-500 text-black',
}

function imageUrl(uniqueName: string, enchant: number, quality: number, size = 96): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

export default async function DemoShopPage() {
  const [tNav, tShopPublic, tShopCatalog, tShop, tShopMyOrders, tDemoMe, tDemoShop, tCta] = await Promise.all([
    getTranslations('nav'),
    getTranslations('shopPublic'),
    getTranslations('shopCatalog'),
    getTranslations('shop'),
    getTranslations('shopMyOrders'),
    getTranslations('demo.me'),
    getTranslations('demo.shop'),
    getTranslations('demo.ctaCard'),
  ])

  const cartItems = DEMO_CART.map((line) => {
    const item = DEMO_CATALOG.find((it) => it.id === line.itemId)!
    return { item, qty: line.qty }
  })
  const totalPoints = cartItems.reduce((sum, l) => sum + l.item.pointPrice * l.qty, 0)
  const totalQty = cartItems.reduce((sum, l) => sum + l.qty, 0)
  const insufficient = totalPoints > BALANCE
  const pendingOrderCount = DEMO_ORDERS.filter((o) => o.status === 'pending').length

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('shop')}</h1>
        <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoShop('notice')}</p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-start gap-2">
        <Info size={14} className="text-amber-300 mt-0.5 shrink-0" />
        <p className="text-amber-100/90 text-xs whitespace-pre-wrap">{tDemoShop('deliveryNotice')}</p>
      </div>

      {/* 내 주문 패널 — 실 ShopMyOrders 와 같은 컴팩트한 헤더 + 펼친 상태로 미리 보여줌 */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="w-full flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <History size={14} className="text-gray-400" />
          <span className="text-sm text-white font-semibold">{tShopMyOrders('title')}</span>
          <span className="text-xs text-gray-500">({DEMO_ORDERS.length})</span>
          {pendingOrderCount > 0 && (
            <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
              {pendingOrderCount}
            </span>
          )}
        </div>
        <ul className="divide-y divide-gray-800">
          {DEMO_ORDERS.map((order) => (
            <li key={order.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE_CLASS[order.status]}`}
                  >
                    {tShopMyOrders(STATUS_LABEL_KEY[order.status])}
                  </span>
                  <span className="text-gray-500">{order.whenLabel}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-amber-300 font-mono font-bold">
                    {order.totalPoints.toLocaleString()}p
                  </span>
                  {order.status === 'pending' && (
                    <DemoActionButton
                      className="text-gray-400 hover:text-red-300 font-semibold transition-colors"
                      ariaLabel={tShopMyOrders('cancelButton')}
                    >
                      {tShopMyOrders('cancelButton')}
                    </DemoActionButton>
                  )}
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap items-center gap-1.5">
                {order.items.map((line, idx) => (
                  <li
                    key={`${order.id}-${idx}`}
                    className="flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-md pl-1 pr-2 py-0.5"
                  >
                    <span className="relative w-6 h-6 shrink-0">
                      <Image
                        src={imageUrl(line.uniqueName, line.enchant, line.quality, 48)}
                        alt={line.nameKo}
                        fill
                        className="object-contain pixel-img"
                        sizes="24px"
                        unoptimized
                      />
                    </span>
                    <span className="text-gray-300 text-[11px]">
                      {line.nameKo}
                      {line.enchant > 0 ? `.${line.enchant}` : ''} ×{line.qty}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3 min-w-0">
          {/* 카탈로그 헤더 — 검색 / 티어 필터 / 잔액 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <DemoActionButton
                asDiv
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-500 cursor-pointer hover:border-gray-600 transition-colors"
              >
                {tShopCatalog('searchPlaceholder')}
              </DemoActionButton>
            </div>
            <DemoActionButton
              asDiv
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white cursor-pointer hover:border-gray-600 transition-colors"
            >
              {tShopCatalog('tierAll')}
            </DemoActionButton>
            <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <span className="text-gray-500">{tShopCatalog('balanceLabel')}</span>
              <span className="font-mono font-bold text-amber-300">{BALANCE.toLocaleString()}p</span>
            </div>
          </div>

          {/* 카탈로그 그리드 — 인게임 상자 배경 */}
          <div
            className="rounded-xl p-3 sm:p-4"
            style={{
              background:
                'linear-gradient(145deg, #3a2d1f 0%, #2a1f15 40%, #1f170f 100%)',
              border: '1px solid #6b5033',
              boxShadow:
                'inset 0 0 30px rgba(0,0,0,0.4), inset 0 0 2px rgba(255,218,150,0.2)',
            }}
          >
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2">
              {DEMO_CATALOG.map((item) => {
                const inCart = DEMO_CART.some((l) => l.itemId === item.id)
                return (
                  <ShopTile
                    key={item.id}
                    item={item}
                    inCart={inCart}
                    priceWarningLabel={tShop('priceWarning')}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* 장바구니 사이드바 — 상시 표시. lg+ 에서만 보임 */}
        <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
          <div className="bg-gray-900 border border-gray-700 rounded-xl flex flex-col max-h-[calc(100vh-2rem)]">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-800">
              <h2 className="text-white font-bold text-sm flex items-center gap-2">
                <ShoppingCart size={14} className="text-amber-400" />
                {tShopCatalog('cartButton')}
              </h2>
              {totalQty > 0 && (
                <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                  {totalQty}
                </span>
              )}
            </div>
            <ul className="divide-y divide-gray-800 max-h-[40vh] overflow-y-auto">
              {cartItems.map(({ item, qty }) => (
                <li key={item.id} className="px-3 py-2 flex items-center gap-2">
                  <span className="relative w-10 h-10 shrink-0">
                    <Image
                      src={imageUrl(item.uniqueName, item.enchant, item.quality, 64)}
                      alt={item.nameKo}
                      fill
                      className="object-contain pixel-img"
                      sizes="40px"
                      unoptimized
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">
                      {item.nameKo}
                      {item.enchant > 0 ? `.${item.enchant}` : ''}
                    </p>
                    <p className="text-amber-300 font-mono text-[11px]">
                      {item.pointPrice.toLocaleString()}p × {qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <DemoActionButton
                      className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center"
                      ariaLabel={tShopCatalog('cart.decAriaLabel')}
                    >
                      <Minus size={12} />
                    </DemoActionButton>
                    <span className="text-xs text-white font-mono w-4 text-center">{qty}</span>
                    <DemoActionButton
                      className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center"
                      ariaLabel={tShopCatalog('cart.incAriaLabel')}
                    >
                      <Plus size={12} />
                    </DemoActionButton>
                    <DemoActionButton
                      className="w-6 h-6 rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center ml-0.5"
                      ariaLabel={tShopCatalog('cart.removeAriaLabel')}
                    >
                      <Trash2 size={12} />
                    </DemoActionButton>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-3 border-t border-gray-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{tShopCatalog('cart.totalLabel')}</span>
                <span
                  className={`font-mono font-bold ${insufficient ? 'text-red-400' : 'text-amber-300'}`}
                >
                  {totalPoints.toLocaleString()}p
                  {insufficient && (
                    <span className="ml-1 text-[10px]">{tShopCatalog('cart.insufficient')}</span>
                  )}
                </span>
              </div>
              <DemoActionButton
                asDiv
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400 cursor-text"
              >
                {tShopCatalog('cart.notePlaceholder')}
              </DemoActionButton>
              <div className="flex items-center gap-2">
                <DemoActionButton className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-3 py-2 rounded-lg text-xs transition-colors">
                  {tShopCatalog('cart.clearButton')}
                </DemoActionButton>
                <DemoActionButton className="flex-[2] bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg text-xs transition-colors inline-flex items-center justify-center gap-1.5">
                  <Send size={12} />
                  {tShopCatalog('cart.submitButton')}
                </DemoActionButton>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoShop('ctaTitle')}
        description={tDemoShop('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />

      {/* mobile-only login hint mimicking real /shop unauthenticated banner */}
      <p className="lg:hidden text-center text-xs text-gray-500">
        {tShopPublic('loginRequiredPrefix')}
        {tShopPublic('loginLink')}
        {tShopPublic('loginRequiredSuffix')}
      </p>
    </div>
  )
}

interface ShopTileProps {
  item: DemoCatalogItem
  inCart: boolean
  priceWarningLabel: string
}

function ShopTile({ item, inCart, priceWarningLabel }: ShopTileProps) {
  const qualityRing = QUALITY_RING[item.quality] ?? QUALITY_RING[1]
  const ringClass = inCart ? 'ring-2 ring-emerald-400' : `ring-1 ${qualityRing}`

  return (
    <DemoActionButton
      ariaLabel={`${item.nameKo}.${item.enchant} / ${item.pointPrice}p`}
      className={`group relative flex flex-col rounded-md bg-[#1a140c] ${ringClass} hover:ring-2 ${
        inCart ? 'hover:ring-emerald-300' : 'hover:ring-amber-300'
      } transition-all`}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-md w-full">
        <Image
          src={imageUrl(item.uniqueName, item.enchant, item.quality, 96)}
          alt={item.nameKo}
          fill
          className="object-contain p-1 pixel-img"
          sizes="100px"
          unoptimized
        />
        {item.enchant > 0 && (
          <span className="absolute top-0.5 left-1 text-[10px] font-bold text-cyan-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            .{item.enchant}
          </span>
        )}
        <span className="absolute top-0.5 right-1 text-[10px] font-bold text-white/90 bg-black/60 rounded px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          ×{item.stock.toLocaleString()}
        </span>
        {inCart && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pointer-events-none">
            <span className="bg-emerald-500 text-white text-[12px] sm:text-sm font-bold font-mono rounded-md px-2 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.7)] ring-1 ring-emerald-300/60 mb-1">
              ×1
            </span>
          </div>
        )}
      </div>

      {item.priceWarning && (
        <span
          className={`block text-[10px] sm:text-[11px] font-bold text-center leading-tight py-0.5 w-full ${PRICE_WARNING_COLOR[item.priceWarning]}`}
        >
          ⚠ {priceWarningLabel}
        </span>
      )}

      <div
        className={`w-full px-1.5 py-1 text-center border-t rounded-b-md ${
          inCart ? 'border-emerald-400/40' : 'border-amber-400/30'
        }`}
        style={{
          background: inCart
            ? 'linear-gradient(to bottom, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.28) 100%)'
            : 'linear-gradient(to bottom, rgba(245,158,11,0.18) 0%, rgba(180,83,9,0.28) 100%)',
        }}
      >
        <p
          className={`text-[13px] sm:text-sm font-bold font-mono leading-tight tracking-tight ${
            inCart ? 'text-emerald-100' : 'text-amber-200'
          }`}
        >
          {item.pointPrice.toLocaleString()}
          <span
            className={`text-[10px] ml-0.5 ${
              inCart ? 'text-emerald-300/80' : 'text-amber-300/70'
            }`}
          >
            P
          </span>
        </p>
      </div>
    </DemoActionButton>
  )
}
