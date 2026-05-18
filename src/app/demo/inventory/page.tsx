import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Boxes, Lock, Minus, Plus, Search, Shield, Sparkles } from 'lucide-react'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'

// 실 /admin/dashboard/inventory 의 비주얼 클론 — 추적 중인 베이스 + 슬롯/티어
// 필터 + 카탈로그 카드 그리드. AdminInventoryGearPanel 은 큰 client 컴포넌트
// (TrackedItemManager, popover 편집 등) 이라 SSR 정적 마크업으로 옮겼다.
// 모든 클릭은 DemoActionButton — 토스트로 데모 안내.

type Tier = 4 | 5 | 6 | 7 | 8
type Slot = 'weapon' | 'offhand' | 'head' | 'armor' | 'shoes'

const TIERS: ReadonlyArray<Tier> = [4, 5, 6, 7, 8]
const SLOTS: ReadonlyArray<Slot> = ['weapon', 'offhand', 'head', 'armor', 'shoes']

const ACTIVE_TIER: Tier = 8
const ACTIVE_SLOT: Slot = 'weapon'

type GearCard = {
  baseItemId: string
  uniqueName: string
  nameKo: string
  slot: Slot
  tier: Tier
  enchantQty: ReadonlyArray<{ enchant: 0 | 1 | 2 | 3 | 4; qty: number }>
}

// T8 무기 위주 — 활성 필터가 weapon + T8 이라 그리드에 그대로 보임. 추적된
// 베이스 9종으로 "어드민이 관리하는 완제품 카탈로그" 가 한 화면에 들어오게 함.
const DEMO_GEAR: ReadonlyArray<GearCard> = [
  {
    baseItemId: 'T8_2H_MACE_HEAVY',
    uniqueName: 'T8_2H_MACE_HEAVY',
    nameKo: 'Heavy Mace',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 3 },
      { enchant: 2, qty: 7 },
      { enchant: 3, qty: 12 },
      { enchant: 4, qty: 2 },
    ],
  },
  {
    baseItemId: 'T8_2H_HOLYSTAFF_AVALON',
    uniqueName: 'T8_2H_HOLYSTAFF_AVALON',
    nameKo: 'Holy Staff (Avalon)',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 2 },
      { enchant: 2, qty: 5 },
      { enchant: 3, qty: 8 },
      { enchant: 4, qty: 1 },
    ],
  },
  {
    baseItemId: 'T8_2H_DAGGERPAIR',
    uniqueName: 'T8_2H_DAGGERPAIR',
    nameKo: 'Dagger Pair',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 1 },
      { enchant: 2, qty: 4 },
      { enchant: 3, qty: 6 },
      { enchant: 4, qty: 0 },
    ],
  },
  {
    baseItemId: 'T8_2H_FIRESTAFF',
    uniqueName: 'T8_2H_FIRESTAFF',
    nameKo: 'Great Fire Staff',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 0 },
      { enchant: 2, qty: 3 },
      { enchant: 3, qty: 4 },
      { enchant: 4, qty: 0 },
    ],
  },
  {
    baseItemId: 'T8_2H_CROSSBOWLARGE',
    uniqueName: 'T8_2H_CROSSBOWLARGE',
    nameKo: 'Heavy Crossbow',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 1 },
      { enchant: 2, qty: 2 },
      { enchant: 3, qty: 5 },
      { enchant: 4, qty: 1 },
    ],
  },
  {
    baseItemId: 'T8_2H_SCYTHE_HELL',
    uniqueName: 'T8_2H_SCYTHE_HELL',
    nameKo: 'Realmbreaker',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 0 },
      { enchant: 2, qty: 1 },
      { enchant: 3, qty: 2 },
      { enchant: 4, qty: 0 },
    ],
  },
  {
    baseItemId: 'T8_MAIN_NATURESTAFF',
    uniqueName: 'T8_MAIN_NATURESTAFF',
    nameKo: 'Nature Staff',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 2 },
      { enchant: 2, qty: 3 },
      { enchant: 3, qty: 7 },
      { enchant: 4, qty: 1 },
    ],
  },
  {
    baseItemId: 'T8_2H_BOW_KEEPER',
    uniqueName: 'T8_2H_BOW_KEEPER',
    nameKo: "Wailing Bow",
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 0 },
      { enchant: 1, qty: 0 },
      { enchant: 2, qty: 1 },
      { enchant: 3, qty: 3 },
      { enchant: 4, qty: 0 },
    ],
  },
  {
    baseItemId: 'T8_2H_AXE_AVALON',
    uniqueName: 'T8_2H_AXE_AVALON',
    nameKo: 'Realmbreaker Axe',
    slot: 'weapon',
    tier: 8,
    enchantQty: [
      { enchant: 0, qty: 1 },
      { enchant: 1, qty: 1 },
      { enchant: 2, qty: 0 },
      { enchant: 3, qty: 0 },
      { enchant: 4, qty: 0 },
    ],
  },
]

const SLOT_COUNTS: Record<Slot, number> = {
  weapon: 9,
  offhand: 4,
  head: 11,
  armor: 12,
  shoes: 11,
}

function totalQty(card: GearCard): number {
  return card.enchantQty.reduce((sum, e) => sum + e.qty, 0)
}

function imageUrl(uniqueName: string, enchant: number, size = 96): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: '1', size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

export default async function DemoInventoryPage() {
  const [t, tDemoMe, tDemoInventory, tCta] = await Promise.all([
    getTranslations('adminInventory'),
    getTranslations('demo.me'),
    getTranslations('demo.inventory'),
    getTranslations('demo.ctaCard'),
  ])

  const trackedCount = DEMO_GEAR.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Boxes size={20} className="text-amber-400" />
            {t('pageTitle')}
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('pageDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoInventory('notice')}</p>
      </div>

      {/* 추적 중인 베이스 패널 — 실 TrackedItemManager 를 압축한 카운트 + 검색바 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-emerald-400" />
            {t('trackedTitle', { count: trackedCount })}
          </h2>
        </div>
        <p className="text-xs text-gray-500">{t('trackedHint')}</p>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <DemoActionButton
            asDiv
            className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-500 cursor-text hover:border-gray-600"
          >
            {t('trackedSearchPlaceholder')}
          </DemoActionButton>
        </div>
      </section>

      {/* 메인 카탈로그 패널 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-amber-400" />
            {t('gearTitle')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('gearHintCatalog')}</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <DemoActionButton
              asDiv
              className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-500 cursor-text hover:border-gray-600"
            >
              {t('searchPlaceholder')}
            </DemoActionButton>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
              {t('tierLabel')}
            </span>
            {TIERS.map((tier) => {
              const active = tier === ACTIVE_TIER
              return (
                <DemoActionButton
                  key={tier}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  T{tier}
                </DemoActionButton>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
              {t('slotLabel')}
            </span>
            {SLOTS.map((s) => {
              const active = s === ACTIVE_SLOT
              return (
                <DemoActionButton
                  key={s}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <span>{t(`gearSlot.${s}`)}</span>
                  <span
                    className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}
                  >
                    {SLOT_COUNTS[s]}
                  </span>
                </DemoActionButton>
              )
            })}
            <DemoActionButton className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-auto bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700">
              {t('hideEmptyOff')}
            </DemoActionButton>
          </div>

          <p className="sm:hidden flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
            <Lock size={12} />
            {t('mobileHint')}
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {DEMO_GEAR.map((card) => (
              <InventoryCard key={card.baseItemId} card={card} />
            ))}
          </div>
        </div>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoInventory('ctaTitle')}
        description={tDemoInventory('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function InventoryCard({ card }: { card: GearCard }) {
  const total = totalQty(card)
  // 가장 비싸게 보유한 enchant 를 카드 대표 이미지로. T8 e3 가 대부분이므로
  // qty 가 최대인 enchant 를 픽한다.
  const heroEnchant = [...card.enchantQty].sort((a, b) => b.qty - a.qty)[0].enchant

  return (
    <DemoActionButton
      ariaLabel={`${card.nameKo} 총 ${total}개`}
      className="group relative flex flex-col rounded-lg bg-gray-950 border border-gray-800 hover:border-amber-500/60 transition-colors overflow-hidden"
    >
      <div className="relative aspect-square w-full bg-gradient-to-br from-gray-900 to-gray-950">
        <Image
          src={imageUrl(card.uniqueName, heroEnchant, 96)}
          alt={card.nameKo}
          fill
          className="object-contain p-1 pixel-img"
          sizes="100px"
          unoptimized
        />
        <span className="absolute top-1 left-1 text-[10px] font-bold text-amber-300 bg-black/70 rounded px-1.5 py-0.5">
          T{card.tier}
        </span>
        <span className="absolute top-1 right-1 text-[10px] font-bold text-white bg-black/70 rounded px-1.5 py-0.5 tabular-nums">
          {total}
        </span>
      </div>
      <div className="px-2 py-1 border-t border-gray-800 bg-gray-900/60">
        <p className="text-[10px] text-white text-center font-semibold truncate leading-tight">
          {card.nameKo}
        </p>
        <div className="mt-1 flex items-center justify-center gap-0.5">
          {card.enchantQty.map(({ enchant, qty }) => (
            <span
              key={enchant}
              className={`text-[9px] font-mono tabular-nums px-1 rounded ${
                qty > 0
                  ? 'text-cyan-200 bg-cyan-500/15'
                  : 'text-gray-700 bg-gray-800/40'
              }`}
              title={`enchant ${enchant}`}
            >
              {qty}
            </span>
          ))}
        </div>
      </div>
      <div className="px-2 py-1.5 border-t border-gray-800 flex items-center justify-center gap-1">
        <span className="w-6 h-6 rounded bg-gray-800 text-gray-400 group-hover:bg-amber-500/20 group-hover:text-amber-300 flex items-center justify-center">
          <Minus size={11} />
        </span>
        <span className="w-6 h-6 rounded bg-gray-800 text-gray-400 group-hover:bg-amber-500/20 group-hover:text-amber-300 flex items-center justify-center">
          <Plus size={11} />
        </span>
      </div>
    </DemoActionButton>
  )
}
