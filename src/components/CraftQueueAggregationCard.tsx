'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Package, MapPin, List } from 'lucide-react'
import {
  applyReturnRate,
  effectiveReturnRate,
} from '@/lib/albion-return-rates'
import type {
  CraftAggregateBreakdown,
  CraftItemAggregateRow,
} from '@/lib/craft-aggregation'
import {
  CRAFT_CITIES,
  CITY_BADGE_STYLE,
  getCraftBonusCity,
  type CraftCity,
} from '@/lib/crafting-cities'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'

interface LocationPreset {
  id: string
  i18nKey: string
  defaultReturnRatePct: number
}

interface Props {
  breakdown: CraftAggregateBreakdown
  focusBonusPct: number
  locations: LocationPreset[]
  // 큐 전체(기본) / 내가 잡은 것 두 가지 컨텍스트로 재사용. 변형은 헤더 카피만 다름.
  variant?: 'queue' | 'mine'
}

// 진행 중 task 들의 buildSnapshot 합산 → 길드가 통째로 만들어야 할 장비 + 필요
// 재료 (반환율 반영). 장비 목록은 서버에서 한 번 계산 (page.tsx) 하고, 이 컴포넌트
// 는 사용자가 도시/포커스 토글에 따라 net 재료 수만 곱셈으로 조정한다.
export default function CraftQueueAggregationCard({
  breakdown,
  focusBonusPct,
  locations,
  variant = 'queue',
}: Props) {
  const t = useTranslations('craftQueue')
  const titleKey = variant === 'mine' ? 'aggregateMineTitle' : 'aggregateTitle'
  const hintKey = variant === 'mine' ? 'aggregateMineHint' : 'aggregateHint'
  const tLoc = useTranslations('craftLocation')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? 'royal_city')
  const [customReturnPct, setCustomReturnPct] = useState('15')
  const [focusUsed, setFocusUsed] = useState(false)
  // 'flat' = 카운트 정렬된 평면 리스트 (기존). 'byCity' = 6 개 도시별 그룹.
  const [itemViewMode, setItemViewMode] = useState<'flat' | 'byCity'>('flat')

  const isCustom = locationId === 'custom'
  const selectedLocation = locations.find((l) => l.id === locationId)
  const baseReturnPct = isCustom
    ? Number(customReturnPct)
    : selectedLocation?.defaultReturnRatePct ?? 0
  const safeBase = Number.isFinite(baseReturnPct) ? baseReturnPct : 0
  const effective = effectiveReturnRate(safeBase, focusUsed, focusBonusPct)

  const netMaterials = useMemo(
    () =>
      breakdown.materials.map((m) => ({
        ...m,
        netCount: applyReturnRate(m.count, effective),
      })),
    [breakdown.materials, effective],
  )

  // 도시별 그룹 — 각 아이템의 도시를 getCraftBonusCity 로 분류. 매핑 안 되는
  // 카테고리는 'unmapped' 버킷으로 모아 별도 섹션 (현재 Shapeshifter 류).
  const groupedByCity = useMemo(() => {
    const buckets = new Map<CraftCity | 'unmapped', CraftItemAggregateRow[]>()
    const counts = new Map<CraftCity | 'unmapped', number>()
    for (const item of breakdown.items) {
      const city = getCraftBonusCity(item.itemId) ?? 'unmapped'
      let bucket = buckets.get(city)
      if (!bucket) {
        bucket = []
        buckets.set(city, bucket)
      }
      bucket.push(item)
      counts.set(city, (counts.get(city) ?? 0) + item.count)
    }
    return { buckets, counts }
  }, [breakdown.items])

  if (breakdown.taskCount === 0 || breakdown.items.length === 0) return null

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Package size={16} className="text-amber-400" />
          {t(titleKey as 'aggregateTitle')}
          <span className="text-xs text-gray-500">
            {t('aggregateTaskCount', { count: breakdown.taskCount })}
          </span>
        </h2>
        <p className="text-[11px] text-gray-500">{t(hintKey as 'aggregateHint')}</p>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            {t('aggregateItemsTitle')}
          </p>
          <div className="inline-flex border border-gray-700 rounded-lg overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setItemViewMode('flat')}
              className={`flex items-center gap-1 px-2 py-1 transition ${
                itemViewMode === 'flat'
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-gray-950 text-gray-400 hover:text-white'
              }`}
              aria-pressed={itemViewMode === 'flat'}
            >
              <List size={11} />
              {t('aggregateViewFlat')}
            </button>
            <button
              type="button"
              onClick={() => setItemViewMode('byCity')}
              className={`flex items-center gap-1 px-2 py-1 transition border-l border-gray-700 ${
                itemViewMode === 'byCity'
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-gray-950 text-gray-400 hover:text-white'
              }`}
              aria-pressed={itemViewMode === 'byCity'}
            >
              <MapPin size={11} />
              {t('aggregateViewByCity')}
            </button>
          </div>
        </div>
        {itemViewMode === 'flat' ? (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {breakdown.items.map((item) => (
              <AggregateItemTile key={item.itemId} item={item} locale={locale} />
            ))}
          </ul>
        ) : (
          <CityGroupedItems groupedByCity={groupedByCity} locale={locale} />
        )}
        {(breakdown.unknownItemCount > 0 || breakdown.artifactCount > 0) && (
          <p className="text-[10px] text-gray-500 leading-relaxed">
            {breakdown.artifactCount > 0 && (
              <span className="mr-2 text-amber-400/80">
                {t('aggregateArtifactWarn', { count: breakdown.artifactCount })}
              </span>
            )}
            {breakdown.unknownItemCount > 0 && (
              <span className="text-amber-400/80">
                {t('aggregateUnknownWarn', { count: breakdown.unknownItemCount })}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('aggregateRatesTitle')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {tLoc(loc.i18nKey)} ({loc.defaultReturnRatePct}%)
              </option>
            ))}
          </select>
          {isCustom && (
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.1}
              value={customReturnPct}
              onChange={(e) => setCustomReturnPct(e.target.value)}
              className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-300 ml-1">
            <input
              type="checkbox"
              checked={focusUsed}
              onChange={(e) => setFocusUsed(e.target.checked)}
              className="rounded border-gray-700 bg-gray-950"
            />
            {t('aggregateFocusToggle', { bonus: focusBonusPct })}
          </label>
          <span className="ml-auto text-[11px] text-gray-400 font-mono">
            {t('aggregateEffectiveReturn', { pct: effective.toFixed(1) })}
          </span>
        </div>
      </div>

      {netMaterials.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            {t('aggregateMaterialsTitle')}
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {netMaterials.map((m) => {
              const displayName =
                getLocalizedItemNameWithEnchant(m.uniqueName, locale, null) ?? m.uniqueName
              return (
                <li
                  key={m.uniqueName}
                  className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
                  title={displayName}
                >
                  <ItemImage itemId={m.uniqueName} itemName={null} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white truncate">{displayName}</p>
                    <p className="text-[10px] text-gray-500">
                      {t('aggregateMaterialGross', { gross: m.count.toLocaleString() })}
                    </p>
                  </div>
                  <span className="text-emerald-300 font-bold font-mono text-sm flex-shrink-0">
                    {m.netCount.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

interface AggregateItemTileProps {
  item: CraftItemAggregateRow
  locale: Locale
}

function AggregateItemTile({ item, locale }: AggregateItemTileProps) {
  const t = useTranslations('craftQueue')
  const displayName =
    getLocalizedItemNameWithEnchant(item.itemId, locale, item.itemName) ?? item.itemId
  return (
    <li
      className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
      title={displayName}
    >
      <ItemImage itemId={item.itemId} itemName={item.itemName} size={32} hoverPreview />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-white truncate">{displayName}</p>
        <p className="text-[10px] text-gray-500">
          {item.isArtifact ? (
            <span className="text-amber-400">{t('aggregateArtifactTag')}</span>
          ) : !item.hasRecipe ? (
            <span className="text-amber-400">{t('aggregateNoRecipeTag')}</span>
          ) : (
            t('aggregateSlotsTag', { count: item.slots.length })
          )}
        </p>
      </div>
      <span className="text-amber-300 font-bold font-mono text-sm flex-shrink-0">
        ×{item.count}
      </span>
    </li>
  )
}

interface CityGroupedItemsProps {
  groupedByCity: {
    buckets: Map<CraftCity | 'unmapped', CraftItemAggregateRow[]>
    counts: Map<CraftCity | 'unmapped', number>
  }
  locale: Locale
}

// 도시별 섹션을 CRAFT_CITIES 순서대로 + unmapped 섹션은 마지막에. 빈 버킷은 스킵.
function CityGroupedItems({ groupedByCity, locale }: CityGroupedItemsProps) {
  const t = useTranslations('craftQueue')
  const tCity = useTranslations('craftQueue.cityBonus')
  const sections: Array<{ key: CraftCity | 'unmapped'; label: string; badgeClass: string }> = []
  for (const city of CRAFT_CITIES) {
    if ((groupedByCity.buckets.get(city)?.length ?? 0) === 0) continue
    sections.push({ key: city, label: tCity(city), badgeClass: CITY_BADGE_STYLE[city] })
  }
  if ((groupedByCity.buckets.get('unmapped')?.length ?? 0) > 0) {
    sections.push({
      key: 'unmapped',
      label: t('aggregateUnmappedBucket'),
      badgeClass: 'bg-gray-700/30 text-gray-300 border-gray-600/50',
    })
  }

  if (sections.length === 0) return null

  return (
    <div className="space-y-3">
      {sections.map(({ key, label, badgeClass }) => {
        const items = groupedByCity.buckets.get(key) ?? []
        const count = groupedByCity.counts.get(key) ?? 0
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded border ${badgeClass}`}
              >
                <MapPin size={11} />
                {label}
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {t('aggregateCityBucketCount', { count })}
              </span>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((item) => (
                <AggregateItemTile key={item.itemId} item={item} locale={locale} />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
