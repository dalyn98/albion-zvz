'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Package, Boxes, EyeOff } from 'lucide-react'
import {
  applyReturnRate,
  effectiveReturnRate,
} from '@/lib/albion-return-rates'
import type { CraftAggregateBreakdown } from '@/lib/craft-aggregation'
import { parseMaterialId, materialKeyString } from '@/lib/inventory'
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
  // 서버에서 직렬화 가능한 [key, qty] 튜플 배열로 전달. Map 은 Server→Client 직렬화
  // 시 일반 객체로 변환되므로 명시적으로 entries 형태로 받는다.
  inventoryEntries: ReadonlyArray<readonly [string, number]>
}

// 도시별 재료 집계 카드. CraftQueueAggregationCard 와 입력 차이는:
// 1. items / materials 가 이미 도시 필터된 breakdown 으로 들어옴
// 2. 길드 재고 토글로 net 에서 재고 차감 미리보기 가능
export default function CityMaterialsCard({
  breakdown,
  focusBonusPct,
  locations,
  inventoryEntries,
}: Props) {
  const t = useTranslations('craftQueue')
  const tLoc = useTranslations('craftLocation')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const [locationId, setLocationId] = useState<string>(
    locations[0]?.id ?? 'royal_city',
  )
  const [customReturnPct, setCustomReturnPct] = useState('15')
  const [focusUsed, setFocusUsed] = useState(false)
  // 'gross' = 재고 무시, 'apply' = 재고 차감해 부족분만 강조.
  const [inventoryMode, setInventoryMode] = useState<'gross' | 'apply'>('gross')

  const isCustom = locationId === 'custom'
  const selectedLocation = locations.find((l) => l.id === locationId)
  const baseReturnPct = isCustom
    ? Number(customReturnPct)
    : selectedLocation?.defaultReturnRatePct ?? 0
  const safeBase = Number.isFinite(baseReturnPct) ? baseReturnPct : 0
  const effective = effectiveReturnRate(safeBase, focusUsed, focusBonusPct)

  const inventoryMap = useMemo(
    () => new Map(inventoryEntries),
    [inventoryEntries],
  )

  // 재료별 net = gross × (1 - 반환율). 재고 차감은 inventoryMode 에 따라.
  const rows = useMemo(() => {
    return breakdown.materials.map((m) => {
      const netCount = applyReturnRate(m.count, effective)
      const matKey = parseMaterialId(m.uniqueName)
      const stock = matKey ? inventoryMap.get(materialKeyString(matKey)) ?? 0 : 0
      const remaining = Math.max(0, netCount - stock)
      return {
        ...m,
        netCount,
        stock,
        remaining,
        trackedInInventory: matKey != null,
      }
    })
  }, [breakdown.materials, effective, inventoryMap])

  if (breakdown.taskCount === 0 || breakdown.items.length === 0) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
        <Package size={28} className="text-gray-600 mx-auto" />
        <p className="text-sm text-gray-400">{t('cityMaterialsEmpty')}</p>
      </section>
    )
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Package size={16} className="text-amber-400" />
          {t('aggregateItemsTitle')}
          <span className="text-xs text-gray-500">
            {t('aggregateTaskCount', { count: breakdown.taskCount })}
          </span>
        </h2>
      </header>

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {breakdown.items.map((item) => {
          const displayName =
            getLocalizedItemNameWithEnchant(item.itemId, locale, item.itemName) ??
            item.itemId
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
              </div>
              <span className="text-amber-300 font-bold font-mono text-sm flex-shrink-0">
                ×{item.count}
              </span>
            </li>
          )
        })}
      </ul>

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

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
              {t('aggregateMaterialsTitle')}
            </p>
            <div className="inline-flex border border-gray-700 rounded-lg overflow-hidden text-[11px]">
              <button
                type="button"
                onClick={() => setInventoryMode('gross')}
                className={`flex items-center gap-1 px-2 py-1 transition ${
                  inventoryMode === 'gross'
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-gray-950 text-gray-400 hover:text-white'
                }`}
                aria-pressed={inventoryMode === 'gross'}
              >
                <EyeOff size={11} />
                {t('inventoryViewIgnore')}
              </button>
              <button
                type="button"
                onClick={() => setInventoryMode('apply')}
                className={`flex items-center gap-1 px-2 py-1 transition border-l border-gray-700 ${
                  inventoryMode === 'apply'
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-gray-950 text-gray-400 hover:text-white'
                }`}
                aria-pressed={inventoryMode === 'apply'}
              >
                <Boxes size={11} />
                {t('inventoryViewApply')}
              </button>
            </div>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rows.map((m) => {
              const displayName =
                getLocalizedItemNameWithEnchant(m.uniqueName, locale, null) ??
                m.uniqueName
              const showInventoryLine = inventoryMode === 'apply'
              return (
                <li
                  key={m.uniqueName}
                  className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
                  title={displayName}
                >
                  <ItemImage itemId={m.uniqueName} itemName={null} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white truncate">
                      {displayName}
                    </p>
                    {showInventoryLine ? (
                      m.trackedInInventory ? (
                        <p className="text-[10px] text-gray-500">
                          {t('inventoryStockLine', {
                            stock: m.stock.toLocaleString(),
                          })}
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-400/80">
                          {t('inventoryNotTracked')}
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-gray-500">
                        {t('aggregateMaterialGross', {
                          gross: m.count.toLocaleString(),
                        })}
                      </p>
                    )}
                  </div>
                  <span
                    className={`font-bold font-mono text-sm flex-shrink-0 ${
                      showInventoryLine && m.trackedInInventory
                        ? m.remaining > 0
                          ? 'text-rose-300'
                          : 'text-emerald-400'
                        : 'text-emerald-300'
                    }`}
                  >
                    {showInventoryLine && m.trackedInInventory
                      ? m.remaining > 0
                        ? m.remaining.toLocaleString()
                        : '✓'
                      : m.netCount.toLocaleString()}
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
