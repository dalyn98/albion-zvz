'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Hammer } from 'lucide-react'
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
  // 진행 단계별 카운트 — getEventCraftAggregate 가 함께 내려준다.
  queuedCount: number
  claimedCount: number
  deliveredCount: number
}

// 어드민 이벤트 상세 페이지에서 "이 이벤트에서 만들어야 할 아이템 + 필요 재료"
// 를 보여주는 카드. 데이터는 server action getEventCraftAggregate() 가 내려주고,
// 사용자는 도시/포커스 토글로 재료 net 수만 클라이언트에서 곱셈으로 조정한다.
// 멤버용 CraftQueueAggregationCard 와 본문 로직은 동일하지만, 컨텍스트(이벤트
// 단위, 진행 단계 카운트 표시)와 i18n 네임스페이스가 달라 별도 컴포넌트로 둔다.
export default function EventCraftAggregateCard({
  breakdown,
  focusBonusPct,
  locations,
  queuedCount,
  claimedCount,
  deliveredCount,
}: Props) {
  const t = useTranslations('eventCraftAggregate')
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

  const totalCount = queuedCount + claimedCount + deliveredCount

  if (totalCount === 0 || breakdown.items.length === 0) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('sectionTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('emptyHint')}</p>
      </section>
    )
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
      <header className="space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('sectionTitle')}
          <span className="text-xs text-gray-500">
            {t('taskCount', { count: totalCount })}
          </span>
        </h2>
        <p className="text-[11px] text-gray-500">{t('sectionHint')}</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {queuedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {t('statusQueued', { count: queuedCount })}
            </span>
          )}
          {claimedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-950/50 text-amber-300 border border-amber-800">
              {t('statusClaimed', { count: claimedCount })}
            </span>
          )}
          {deliveredCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-800">
              {t('statusDelivered', { count: deliveredCount })}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('itemsTitle')}
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
                      <span className="text-amber-400">{t('artifactTag')}</span>
                    ) : !item.hasRecipe ? (
                      <span className="text-amber-400">{t('noRecipeTag')}</span>
                    ) : (
                      t('slotsTag', { count: item.slots.length })
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
                {t('artifactWarn', { count: breakdown.artifactCount })}
              </span>
            )}
            {breakdown.unknownItemCount > 0 && (
              <span className="text-amber-400/80">
                {t('unknownWarn', { count: breakdown.unknownItemCount })}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('ratesTitle')}
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
            {t('focusToggle', { bonus: focusBonusPct })}
          </label>
          <span className="ml-auto text-[11px] text-gray-400 font-mono">
            {t('effectiveReturn', { pct: effective.toFixed(1) })}
          </span>
        </div>
      </div>

      {netMaterials.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            {t('materialsTitle')}
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
                      {t('materialGross', { gross: m.count.toLocaleString() })}
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
