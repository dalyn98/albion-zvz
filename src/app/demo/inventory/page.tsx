'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Boxes, Lock, Minus, Plus, Search, Shield, Sparkles } from 'lucide-react'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

// 데모 사용자가 실제 앱처럼 체험할 수 있도록 클라이언트 컴포넌트로 전환. 추적
// 검색, 카탈로그 검색, 티어/슬롯 필터, 빈 카드 숨김 토글, 카드별 enchant3 수량
// ± 까지 실제 상태가 움직인다. 백엔드 호출이 일어나야 할 단일 동작 (저장) 은
// 데모 범위 밖이라 ± 결과는 페이지 reload 시 초기화 — 명시적 안내 노출.

type Tier = 4 | 5 | 6 | 7 | 8
type Slot = 'weapon' | 'offhand' | 'head' | 'armor' | 'shoes'

const TIERS: ReadonlyArray<Tier> = [4, 5, 6, 7, 8]
const SLOTS: ReadonlyArray<Slot> = ['weapon', 'offhand', 'head', 'armor', 'shoes']

type GearCard = {
  baseItemId: string
  uniqueName: string
  nameKo: string
  slot: Slot
  tier: Tier
  enchantQty: ReadonlyArray<{ enchant: 0 | 1 | 2 | 3 | 4; qty: number }>
}

const DEMO_GEAR: ReadonlyArray<GearCard> = [
  { baseItemId: 'T8_2H_MACE', uniqueName: 'T8_2H_MACE', nameKo: 'Heavy Mace', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 3 }, { enchant: 2, qty: 7 }, { enchant: 3, qty: 12 }, { enchant: 4, qty: 2 }] },
  { baseItemId: 'T8_MAIN_HOLYSTAFF_AVALON', uniqueName: 'T8_MAIN_HOLYSTAFF_AVALON', nameKo: 'Hallowfall', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 2 }, { enchant: 2, qty: 5 }, { enchant: 3, qty: 8 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_2H_DAGGERPAIR', uniqueName: 'T8_2H_DAGGERPAIR', nameKo: 'Dagger Pair', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 4 }, { enchant: 3, qty: 6 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_2H_FIRESTAFF', uniqueName: 'T8_2H_FIRESTAFF', nameKo: 'Great Fire Staff', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 0 }, { enchant: 2, qty: 3 }, { enchant: 3, qty: 4 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_2H_CROSSBOWLARGE', uniqueName: 'T8_2H_CROSSBOWLARGE', nameKo: 'Heavy Crossbow', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 2 }, { enchant: 3, qty: 5 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_2H_SCYTHE_HELL', uniqueName: 'T8_2H_SCYTHE_HELL', nameKo: 'Realmbreaker', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 0 }, { enchant: 2, qty: 1 }, { enchant: 3, qty: 2 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_MAIN_NATURESTAFF', uniqueName: 'T8_MAIN_NATURESTAFF', nameKo: 'Nature Staff', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 2 }, { enchant: 2, qty: 3 }, { enchant: 3, qty: 7 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_2H_BOW_KEEPER', uniqueName: 'T8_2H_BOW_KEEPER', nameKo: 'Wailing Bow', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 0 }, { enchant: 2, qty: 1 }, { enchant: 3, qty: 3 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_2H_AXE_AVALON', uniqueName: 'T8_2H_AXE_AVALON', nameKo: 'Realmbreaker Axe', slot: 'weapon', tier: 8,
    enchantQty: [{ enchant: 0, qty: 1 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 0 }, { enchant: 3, qty: 0 }, { enchant: 4, qty: 0 }] },
  // 다른 슬롯/티어에서도 필터가 의미 있게 작동하도록 보강
  { baseItemId: 'T8_HEAD_PLATE_SET1', uniqueName: 'T8_HEAD_PLATE_SET1', nameKo: 'Guardian Helmet', slot: 'head', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 2 }, { enchant: 2, qty: 4 }, { enchant: 3, qty: 14 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_HEAD_LEATHER_SET2', uniqueName: 'T8_HEAD_LEATHER_SET2', nameKo: 'Stalker Hood', slot: 'head', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 3 }, { enchant: 3, qty: 8 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_ARMOR_PLATE_SET1', uniqueName: 'T8_ARMOR_PLATE_SET1', nameKo: 'Guardian Armor', slot: 'armor', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 2 }, { enchant: 2, qty: 5 }, { enchant: 3, qty: 11 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_ARMOR_CLOTH_SET3', uniqueName: 'T8_ARMOR_CLOTH_SET3', nameKo: 'Royal Robe', slot: 'armor', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 2 }, { enchant: 3, qty: 6 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T8_SHOES_PLATE_SET1', uniqueName: 'T8_SHOES_PLATE_SET1', nameKo: 'Guardian Boots', slot: 'shoes', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 2 }, { enchant: 2, qty: 4 }, { enchant: 3, qty: 13 }, { enchant: 4, qty: 1 }] },
  { baseItemId: 'T8_OFF_SHIELD', uniqueName: 'T8_OFF_SHIELD', nameKo: 'Stalwart Shield', slot: 'offhand', tier: 8,
    enchantQty: [{ enchant: 0, qty: 0 }, { enchant: 1, qty: 1 }, { enchant: 2, qty: 3 }, { enchant: 3, qty: 7 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T7_2H_MACE', uniqueName: 'T7_2H_MACE', nameKo: 'Heavy Mace', slot: 'weapon', tier: 7,
    enchantQty: [{ enchant: 0, qty: 2 }, { enchant: 1, qty: 4 }, { enchant: 2, qty: 6 }, { enchant: 3, qty: 8 }, { enchant: 4, qty: 0 }] },
  { baseItemId: 'T7_HEAD_PLATE_SET1', uniqueName: 'T7_HEAD_PLATE_SET1', nameKo: 'Soldier Helmet', slot: 'head', tier: 7,
    enchantQty: [{ enchant: 0, qty: 1 }, { enchant: 1, qty: 3 }, { enchant: 2, qty: 5 }, { enchant: 3, qty: 9 }, { enchant: 4, qty: 0 }] },
]

function imageUrl(uniqueName: string, enchant: number, size = 96): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: '1', size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

type EnchantQtyMap = Record<string, Record<number, number>>
const INVENTORY_TOUR_STEPS = [
  { id: 'inventory-tracked' },
  { id: 'inventory-filters' },
  { id: 'inventory-grid' },
] as const

function toInitialQtyMap(): EnchantQtyMap {
  const map: EnchantQtyMap = {}
  for (const card of DEMO_GEAR) {
    map[card.baseItemId] = {}
    for (const eq of card.enchantQty) {
      map[card.baseItemId][eq.enchant] = eq.qty
    }
  }
  return map
}

export default function DemoInventoryPage() {
  const t = useTranslations('adminInventory')
  const tDemoMe = useTranslations('demo.me')
  const tDemoInventory = useTranslations('demo.inventory')
  const tCta = useTranslations('demo.ctaCard')

  const [trackedSearch, setTrackedSearch] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [tier, setTier] = useState<Tier>(8)
  const [slot, setSlot] = useState<Slot>('weapon')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [qtyMap, setQtyMap] = useState<EnchantQtyMap>(toInitialQtyMap)

  // SLOT_COUNTS — 데이터 기반으로 계산
  const slotCounts = SLOTS.reduce<Record<Slot, number>>((acc, s) => {
    acc[s] = DEMO_GEAR.filter((c) => c.slot === s && c.tier === tier).length
    return acc
  }, { weapon: 0, offhand: 0, head: 0, armor: 0, shoes: 0 })

  const trackedFiltered = DEMO_GEAR.filter((card) => {
    if (!trackedSearch.trim()) return true
    const q = trackedSearch.toLowerCase()
    return card.nameKo.toLowerCase().includes(q) || card.uniqueName.toLowerCase().includes(q)
  })

  const catalogFiltered = DEMO_GEAR.filter((card) => {
    if (card.tier !== tier) return false
    if (card.slot !== slot) return false
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase()
      if (!card.nameKo.toLowerCase().includes(q) && !card.uniqueName.toLowerCase().includes(q)) return false
    }
    if (hideEmpty) {
      const total = Object.values(qtyMap[card.baseItemId] ?? {}).reduce((s, n) => s + n, 0)
      if (total === 0) return false
    }
    return true
  })

  const adjustQty = (baseItemId: string, enchant: number, delta: number) => {
    setQtyMap((prev) => {
      const cur = prev[baseItemId]?.[enchant] ?? 0
      const next = Math.max(0, cur + delta)
      return {
        ...prev,
        [baseItemId]: { ...(prev[baseItemId] ?? {}), [enchant]: next },
      }
    })
  }

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={INVENTORY_TOUR_STEPS} namespace="inventory" />
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

      {/* 추적 패널 — 검색 입력 작동 */}
      <section data-tour-id="inventory-tracked" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-emerald-400" />
            {t('trackedTitle', { count: trackedFiltered.length })}
          </h2>
        </div>
        <p className="text-xs text-gray-500">{t('trackedHint')}</p>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            value={trackedSearch}
            onChange={(e) => setTrackedSearch(e.target.value)}
            placeholder={t('trackedSearchPlaceholder')}
            className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-400 focus:outline-none transition-colors"
          />
        </div>
      </section>

      {/* 메인 카탈로그 — 티어/슬롯/검색/빈카드숨김 모두 작동 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield size={16} className="text-amber-400" />
            {t('gearTitle')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('gearHintCatalog')}</p>
        </div>

        <div data-tour-id="inventory-filters" className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-400 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
              {t('tierLabel')}
            </span>
            {TIERS.map((tt) => {
              const active = tt === tier
              return (
                <button
                  key={tt}
                  type="button"
                  onClick={() => setTier(tt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  T{tt}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
              {t('slotLabel')}
            </span>
            {SLOTS.map((s) => {
              const active = s === slot
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
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
                    {slotCounts[s]}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setHideEmpty((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-auto border ${
                hideEmpty
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
              }`}
            >
              {hideEmpty ? t('hideEmptyOn') : t('hideEmptyOff')}
            </button>
          </div>

          <p className="sm:hidden flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
            <Lock size={12} />
            {t('mobileHint')}
          </p>

          {catalogFiltered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-12 bg-gray-950/40 border border-gray-800 rounded-lg">
              {t('emptyCatalog')}
            </p>
          ) : (
            <div data-tour-id="inventory-grid" className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {catalogFiltered.map((card) => (
                <InventoryCard
                  key={card.baseItemId}
                  card={card}
                  qtyOverride={qtyMap[card.baseItemId] ?? {}}
                  onAdjust={(enchant, delta) => adjustQty(card.baseItemId, enchant, delta)}
                />
              ))}
            </div>
          )}
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

interface InventoryCardProps {
  card: GearCard
  qtyOverride: Record<number, number>
  onAdjust: (enchant: number, delta: number) => void
}

function InventoryCard({ card, qtyOverride, onAdjust }: InventoryCardProps) {
  const enchantQtyResolved = card.enchantQty.map((e) => ({
    enchant: e.enchant,
    qty: qtyOverride[e.enchant] ?? e.qty,
  }))
  const total = enchantQtyResolved.reduce((sum, e) => sum + e.qty, 0)
  const heroEnchant = [...enchantQtyResolved].sort((a, b) => b.qty - a.qty)[0]?.enchant ?? 3

  return (
    <div className="group relative flex flex-col rounded-lg bg-gray-950 border border-gray-800 hover:border-amber-500/60 transition-colors overflow-hidden">
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
          {enchantQtyResolved.map(({ enchant, qty }) => (
            <span
              key={enchant}
              className={`text-[9px] font-mono tabular-nums px-1 rounded ${
                qty > 0 ? 'text-cyan-200 bg-cyan-500/15' : 'text-gray-700 bg-gray-800/40'
              }`}
              title={`enchant ${enchant}`}
            >
              {qty}
            </span>
          ))}
        </div>
      </div>
      <div className="px-2 py-1.5 border-t border-gray-800 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => onAdjust(heroEnchant, -1)}
          className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:bg-amber-500/20 hover:text-amber-300 flex items-center justify-center"
          aria-label={`${card.nameKo} -1`}
        >
          <Minus size={11} />
        </button>
        <button
          type="button"
          onClick={() => onAdjust(heroEnchant, 1)}
          className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:bg-amber-500/20 hover:text-amber-300 flex items-center justify-center"
          aria-label={`${card.nameKo} +1`}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}
