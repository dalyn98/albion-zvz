import { ShoppingBag, ShieldCheck, Clock, Trophy } from 'lucide-react'
import { DEMO_SHOP_REGEAR_STATS } from '@/data/demo-seed'
import { getLocalizedItemName } from '@/lib/item-names'
import type { getLocale } from '@/lib/locale'
import AlbionItemImage from '@/components/AlbionItemImage'
import CollapsibleList from '@/components/CollapsibleList'
import {
  DemoStatCard,
  STATS_COLLAPSED_ROWS,
  itemImageUrl,
  type StatsTranslator,
} from './shared'

export default function ShopRegearSection({
  tStats,
  locale,
}: {
  tStats: StatsTranslator
  locale: Awaited<ReturnType<typeof getLocale>>
}) {
  const stats = DEMO_SHOP_REGEAR_STATS

  const cards = [
    {
      label: tStats('shopOrdersLabel', { days: stats.windowDays }),
      value: stats.ordersCreated,
      hint: tStats('shopOrdersHint', {
        approved: stats.ordersApproved.toLocaleString(),
        points: stats.pointsSpent.toLocaleString(),
      }),
      icon: ShoppingBag,
      tone: 'accent' as const,
    },
    {
      label: tStats('regearCreatedLabel', { days: stats.windowDays }),
      value: stats.regearCreated,
      hint: tStats('regearCreatedHint', {
        approved: stats.regearApproved.toLocaleString(),
        silver: stats.silverPaid.toLocaleString(),
      }),
      icon: ShieldCheck,
      tone: 'success' as const,
    },
    {
      label: tStats('shopPendingLabel'),
      value: stats.ordersPending,
      hint: tStats('shopPendingHint'),
      icon: Clock,
      tone: stats.ordersPending > 0 ? ('danger' as const) : ('neutral' as const),
    },
    {
      label: tStats('regearPendingLabel'),
      value: stats.regearPending,
      hint: tStats('regearPendingHint'),
      icon: Clock,
      tone: stats.regearPending > 0 ? ('danger' as const) : ('neutral' as const),
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold text-white">
          {tStats('shopRegearTitle', { days: stats.windowDays })}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          return (
            <DemoStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
            />
          )
        })}
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('topSoldTitle')}</h3>
          <span className="text-xs text-gray-500">
            {tStats('topSoldSubtitle', { count: stats.topSoldItems.length })}
          </span>
        </header>
        {stats.topSoldItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('topSoldEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="items"
          >
            {stats.topSoldItems.map((item, idx) => {
              const displayName =
                getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
                return (
                <li
                  key={`${item.uniqueName}@${item.enchant}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
                >
                  <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                  <div className="relative w-8 h-8 rounded bg-gray-950 flex-shrink-0">
                    <AlbionItemImage
                      src={itemImageUrl(item.uniqueName, item.enchant)}
                      alt={displayName}
                      fill
                      className="object-contain pixel-img"
                    />
                  </div>
                  <span className="flex-1 text-sm text-gray-200 truncate">
                    {displayName}
                    {item.enchant > 0 && (
                      <span className="text-amber-300 ml-1 font-mono">.{item.enchant}</span>
                    )}
                  </span>
                  <span className="text-xs font-mono text-gray-400 tabular-nums">
                    × {item.quantity.toLocaleString()}
                  </span>
                  <span className="text-sm font-mono text-amber-300 tabular-nums w-24 text-right">
                    {item.points.toLocaleString()}p
                  </span>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}
