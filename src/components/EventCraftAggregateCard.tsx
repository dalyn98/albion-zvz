'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Hammer } from 'lucide-react'
import type { CraftAggregateBreakdown } from '@/lib/craft-aggregation'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemImage from './ItemImage'

interface Props {
  breakdown: CraftAggregateBreakdown
  // 진행 단계별 카운트 — getEventCraftAggregate 가 함께 내려준다.
  queuedCount: number
  claimedCount: number
  deliveredCount: number
}

// 어드민 이벤트 상세 페이지에서 "이 이벤트에서 만들어야 할 아이템" 을 보여주는
// 카드. 정련 재료 트래킹 폐기 (마이그 112) 후, 재료 BoM 섹션은 제거되고 itemId
// 단위 합산만 남는다. 데이터는 server action getEventCraftAggregate() 가 내려준다.
export default function EventCraftAggregateCard({
  breakdown,
  queuedCount,
  claimedCount,
  deliveredCount,
}: Props) {
  const t = useTranslations('eventCraftAggregate')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

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
    </section>
  )
}
