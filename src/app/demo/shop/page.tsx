import { Info, ShoppingBag, Sparkles } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import ShopCatalog, { type CatalogItem } from '@/components/ShopCatalog'
import ShopMyOrders from '@/components/ShopMyOrders'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import type { MyOrderRow } from '@/app/actions/shop-member'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

const BALANCE = 4280
const SHOP_TOUR_STEPS = [
  { id: 'shop-orders' },
  { id: 'shop-catalog' },
  { id: 'shop-cart' },
] as const
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

const DEMO_CATALOG: CatalogItem[] = [
  { id: '1', uniqueName: 'T8_2H_MACE', enchant: 3, quality: 3, stock: 12, nameKo: 'Heavy Mace', category: 'weapon', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '2', uniqueName: 'T8_MAIN_HOLYSTAFF_AVALON', enchant: 3, quality: 3, stock: 8, nameKo: 'Hallowfall', category: 'weapon', tier: 8, pointPrice: 80, priceWarning: 'quality' },
  { id: '3', uniqueName: 'T8_2H_DAGGERPAIR', enchant: 3, quality: 3, stock: 6, nameKo: 'Dagger Pair', category: 'weapon', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '4', uniqueName: 'T8_2H_FIRESTAFF', enchant: 3, quality: 3, stock: 4, nameKo: 'Great Fire Staff', category: 'weapon', tier: 8, pointPrice: 80, priceWarning: null },
  { id: '5', uniqueName: 'T8_2H_CROSSBOWLARGE', enchant: 3, quality: 3, stock: 5, nameKo: 'Heavy Crossbow', category: 'weapon', tier: 8, pointPrice: 80, priceWarning: 'window' },
  { id: '6', uniqueName: 'T8_HEAD_PLATE_SET1', enchant: 3, quality: 3, stock: 14, nameKo: 'Guardian Helmet', category: 'armor', tier: 8, pointPrice: 32, priceWarning: null },
  { id: '7', uniqueName: 'T8_ARMOR_PLATE_SET1', enchant: 3, quality: 3, stock: 11, nameKo: 'Guardian Armor', category: 'armor', tier: 8, pointPrice: 48, priceWarning: null },
  { id: '8', uniqueName: 'T8_SHOES_PLATE_SET1', enchant: 3, quality: 3, stock: 13, nameKo: 'Guardian Boots', category: 'armor', tier: 8, pointPrice: 32, priceWarning: null },
  { id: '9', uniqueName: 'T8_OFF_SHIELD', enchant: 3, quality: 3, stock: 7, nameKo: 'Stalwart Shield', category: 'offhand', tier: 8, pointPrice: 36, priceWarning: 'bluezone' },
  { id: '10', uniqueName: 'T8_CAPE', enchant: 3, quality: 3, stock: 22, nameKo: 'Cape', category: 'cape', tier: 8, pointPrice: 24, priceWarning: null },
  { id: '11', uniqueName: 'T7_2H_MACE', enchant: 2, quality: 3, stock: 18, nameKo: 'Heavy Mace', category: 'weapon', tier: 7, pointPrice: 40, priceWarning: null },
  { id: '12', uniqueName: 'T7_2H_HOLYSTAFF', enchant: 2, quality: 3, stock: 9, nameKo: 'Holy Staff', category: 'weapon', tier: 7, pointPrice: 38, priceWarning: null },
]

function getDemoNowMs(): number {
  return Date.now()
}

function getDemoOrders(nowMs: number): MyOrderRow[] {
  return [
  {
    id: 'ord-3',
    status: 'pending',
    totalPoints: 116,
    priceReviewRequired: false,
    memberNote: 'Mercia CTA before reset',
    adminNote: null,
    pickupNote: null,
    createdAt: new Date(nowMs - 2 * HOUR_MS).toISOString(),
    resolvedAt: null,
    items: [
      { uniqueName: 'T8_2H_MACE', enchant: 3, quality: 3, nameKo: 'Heavy Mace', quantity: 1, unitPoints: 80 },
      { uniqueName: 'T8_OFF_SHIELD', enchant: 3, quality: 3, nameKo: 'Stalwart Shield', quantity: 1, unitPoints: 36 },
    ],
  },
  {
    id: 'ord-2',
    status: 'approved',
    totalPoints: 112,
    priceReviewRequired: false,
    memberNote: null,
    adminNote: null,
    pickupNote: 'Guild chest tab 2',
    createdAt: new Date(nowMs - DAY_MS - HOUR_MS).toISOString(),
    resolvedAt: new Date(nowMs - DAY_MS - 35 * 60 * 1000).toISOString(),
    items: [
      { uniqueName: 'T8_HEAD_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Helmet', quantity: 1, unitPoints: 32 },
      { uniqueName: 'T8_ARMOR_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Armor', quantity: 1, unitPoints: 48 },
      { uniqueName: 'T8_SHOES_PLATE_SET1', enchant: 3, quality: 3, nameKo: 'Guardian Boots', quantity: 1, unitPoints: 32 },
    ],
  },
  {
    id: 'ord-1',
    status: 'rejected',
    totalPoints: 160,
    priceReviewRequired: false,
    memberNote: null,
    adminNote: 'Stock reserved for next CTA',
    pickupNote: null,
    createdAt: new Date(nowMs - 3 * DAY_MS).toISOString(),
    resolvedAt: new Date(nowMs - 3 * DAY_MS + 35 * 60 * 1000).toISOString(),
    items: [
      { uniqueName: 'T8_2H_FIRESTAFF', enchant: 3, quality: 3, nameKo: 'Great Fire Staff', quantity: 2, unitPoints: 80 },
    ],
  },
  ]
}

export default async function DemoShopPage() {
  const [tNav, tDemoMe, tDemoShop, tCta] = await Promise.all([
    getTranslations('nav'),
    getTranslations('demo.me'),
    getTranslations('demo.shop'),
    getTranslations('demo.ctaCard'),
  ])
  const demoOrders = getDemoOrders(getDemoNowMs())

  return (
    <div className="space-y-4 max-w-7xl">
      <DemoGuidedTour steps={SHOP_TOUR_STEPS} namespace="shop" />
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

      <div
        data-tour-id="shop-orders"
        className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-start gap-2"
      >
        <Info size={14} className="text-amber-300 mt-0.5 shrink-0" />
        <p className="text-amber-100/90 text-xs whitespace-pre-wrap">{tDemoShop('deliveryNotice')}</p>
      </div>

      <ShopMyOrders
        orders={demoOrders}
        timezone={DEFAULT_TENANT_TIMEZONE}
        interactionMode="demo"
      />

      <div data-tour-id="shop-cart">
        <div data-tour-id="shop-catalog">
          <ShopCatalog
            items={DEMO_CATALOG}
            balance={BALANCE}
            isMember
            baseCityLabel="Caerleon"
            discountRate={1}
            interactionMode="demo"
          />
        </div>
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('shop.title')}
        description={tCta('shop.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
