'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Package, MapPin, List } from 'lucide-react'
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
import { useItemNameResolver } from '@/lib/item-names-client'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'

interface Props {
  breakdown: CraftAggregateBreakdown
  // 큐 전체(기본) / 내가 잡은 것 두 가지 컨텍스트로 재사용. 변형은 헤더 카피만 다름.
  variant?: 'queue' | 'mine'
  // itemId → 길드 재고 수량. 추적 슬롯 (무기/머리/갑옷/신발/보조/망토) 만 키가
  // 깔리고, 가방·소모품 등은 키 자체가 없다 (= 배지 미노출).
  stockByItemId: Record<string, number>
}

// 진행 중 task 들의 buildSnapshot 합산 → 길드가 통째로 만들어야 할 장비 목록.
// 정련 재료 트래킹은 폐기됐고 (마이그 112), 이 카드는 itemId 단위 합산만 보여준다.
// 도시별 그룹은 박스 픽업 / 도시 분담 제작 시나리오 보조 용도.
export default function CraftQueueAggregationCard({
  breakdown,
  variant = 'queue',
  stockByItemId,
}: Props) {
  const t = useTranslations('craftQueue')
  const titleKey = variant === 'mine' ? 'aggregateMineTitle' : 'aggregateTitle'
  const hintKey = variant === 'mine' ? 'aggregateMineHint' : 'aggregateHint'
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  // 'flat' = 카운트 정렬된 평면 리스트. 'byCity' = 6 개 도시별 그룹 (기본값 — 박스
  // 픽업 / 도시 분담 제작이 주된 사용 시나리오라서).
  const [itemViewMode, setItemViewMode] = useState<'flat' | 'byCity'>('byCity')

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
              <AggregateItemTile
                key={item.itemId}
                item={item}
                locale={locale}
                stockByItemId={stockByItemId}
              />
            ))}
          </ul>
        ) : (
          <CityGroupedItems
            groupedByCity={groupedByCity}
            locale={locale}
            stockByItemId={stockByItemId}
          />
        )}
      </div>
    </section>
  )
}

interface AggregateItemTileProps {
  item: CraftItemAggregateRow
  locale: Locale
  stockByItemId: Record<string, number>
}

// 티어/인챈트는 itemId 에서 직접 파싱. 같은 베이스 아이템이라도 인챈트가 다르면
// 별개 itemId 로 집계되므로 (인챈트별 재료가 다름) 카드별로 정확히 표기됨.
function parseTierEnchant(itemId: string): { tier: number | null; enchant: number } {
  const at = itemId.lastIndexOf('@')
  const base = at === -1 ? itemId : itemId.slice(0, at)
  const enchantRaw = at === -1 ? 0 : Number(itemId.slice(at + 1))
  const enchant = Number.isFinite(enchantRaw) && enchantRaw > 0 ? enchantRaw : 0
  const m = base.match(/^T(\d)_/)
  const tier = m ? Number(m[1]) : null
  return { tier, enchant }
}

function AggregateItemTile({ item, locale, stockByItemId }: AggregateItemTileProps) {
  const t = useTranslations('craftQueue')
  const { getLocalizedItemNameWithEnchant } = useItemNameResolver(locale)
  const displayName =
    getLocalizedItemNameWithEnchant(item.itemId, locale, item.itemName) ?? item.itemId
  const { tier, enchant } = parseTierEnchant(item.itemId)
  // 추적되지 않는 itemId (가방/소모품 등) 는 키 자체가 없어서 배지 미노출.
  // stock ≥ 필요 = emerald (충분), 0 < stock < 필요 = amber (부분), 0 = 회색 (없음).
  const stock = stockByItemId[item.itemId]
  const tracked = stock != null
  const stockClass = !tracked
    ? ''
    : stock >= item.count
      ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/30'
      : stock > 0
        ? 'text-amber-300 bg-amber-500/10 border border-amber-500/30'
        : 'text-gray-500 bg-gray-950 border border-gray-800'
  return (
    <li
      className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
      title={displayName}
    >
      <ItemImage itemId={item.itemId} itemName={item.itemName} size={32} hoverPreview />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-white truncate">{displayName}</p>
        <p className="text-[10px] text-gray-500 flex items-center gap-1 flex-wrap">
          {tier !== null && (
            <span className="text-gray-300 font-mono">T{tier}</span>
          )}
          {enchant > 0 && (
            <span className="text-emerald-400 font-mono">
              {t('aggregateEnchantLabel', { level: enchant })}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-amber-300 font-bold font-mono text-sm">
          ×{item.count}
        </span>
        {tracked && (
          <span
            className={`text-[10px] font-mono px-1 rounded leading-none py-0.5 ${stockClass}`}
            aria-label={t('aggregateStockBadgeAria', { count: stock, needed: item.count })}
          >
            {t('aggregateStockBadge', { count: stock })}
          </span>
        )}
      </div>
    </li>
  )
}

interface CityGroupedItemsProps {
  groupedByCity: {
    buckets: Map<CraftCity | 'unmapped', CraftItemAggregateRow[]>
    counts: Map<CraftCity | 'unmapped', number>
  }
  locale: Locale
  stockByItemId: Record<string, number>
}

// 도시별 섹션을 CRAFT_CITIES 순서대로 + unmapped 섹션은 마지막에. 빈 버킷은 스킵.
function CityGroupedItems({ groupedByCity, locale, stockByItemId }: CityGroupedItemsProps) {
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
            <div className="flex items-center gap-2 px-1 -mx-1 py-0.5">
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
                <AggregateItemTile
                  key={item.itemId}
                  item={item}
                  locale={locale}
                  stockByItemId={stockByItemId}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
