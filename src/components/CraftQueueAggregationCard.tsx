'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Package } from 'lucide-react'
import {
  applyReturnRate,
  effectiveReturnRate,
} from '@/lib/albion-return-rates'
import type { CraftAggregateBreakdown } from '@/lib/craft-aggregation'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
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
}

// 진행 중 task 들의 buildSnapshot 합산 → 길드가 통째로 만들어야 할 장비 + 필요
// 재료 (반환율 반영). 장비 목록은 서버에서 한 번 계산 (page.tsx) 하고, 이 컴포넌트
// 는 사용자가 도시/포커스 토글에 따라 net 재료 수만 곱셈으로 조정한다.
export default function CraftQueueAggregationCard({
  breakdown,
  focusBonusPct,
  locations,
}: Props) {
  const t = useTranslations('craftQueue')
  const tLoc = useTranslations('craftLocation')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? 'royal_city')
  const [customReturnPct, setCustomReturnPct] = useState('15')
  const [focusUsed, setFocusUsed] = useState(false)

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

  if (breakdown.taskCount === 0 || breakdown.items.length === 0) return null

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Package size={16} className="text-amber-400" />
          {t('aggregateTitle')}
          <span className="text-xs text-gray-500">
            {t('aggregateTaskCount', { count: breakdown.taskCount })}
          </span>
        </h2>
        <p className="text-[11px] text-gray-500">{t('aggregateHint')}</p>
      </header>

      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('aggregateItemsTitle')}
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {breakdown.items.map((item) => {
            const displayName =
              getLocalizedItemNameWithEnchant(item.itemId, locale, item.itemName) ?? item.itemId
            return (
              <li
                key={item.itemId}
                className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
                title={displayName}
              >
                <ItemImage
                  itemId={item.itemId}
                  itemName={item.itemName}
                  size={32}
                  hoverPreview
                />
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
          })}
        </ul>
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
