import { ShoppingBag, ShieldCheck, Clock, PackageSearch } from 'lucide-react'
import Link from 'next/link'
import { getShopRegearStats } from '@/app/actions/stats-admin'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import AlbionItemImage from '@/components/AlbionItemImage'
import CollapsibleList from '@/components/CollapsibleList'
import { STATS_COLLAPSED_ROWS, itemImageUrl, type StatsTranslator } from './shared'
import type { RegearOriginFilter } from '@/lib/regear-origin-filter'

export default async function ShopRegearSection({
  tStats,
  locale,
  regearOrigin,
}: {
  tStats: StatsTranslator
  locale: Locale
  regearOrigin: RegearOriginFilter
}) {
  const { stats, error } = await getShopRegearStats(regearOrigin)
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('shopRegearLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const cards = [
    {
      label: tStats('shopOrdersLabel', { days: stats.windowDays }),
      value: stats.ordersCreated,
      hint: tStats('shopOrdersHint', {
        approved: stats.ordersApproved.toLocaleString(),
        points: stats.pointsSpent.toLocaleString(),
      }),
      icon: ShoppingBag,
      accent: 'text-amber-300',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: tStats('regearCreatedLabel', { days: stats.windowDays }),
      value: stats.regearCreated,
      hint: tStats('regearCreatedHint', {
        approved: stats.regearApproved.toLocaleString(),
        silver: stats.silverPaid.toLocaleString(),
      }),
      icon: ShieldCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('shopPendingLabel'),
      value: stats.ordersPending,
      hint: tStats('shopPendingHint'),
      icon: Clock,
      accent: stats.ordersPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.ordersPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.ordersPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
    {
      label: tStats('regearPendingLabel'),
      value: stats.regearPending,
      hint: tStats('regearPendingHint'),
      icon: Clock,
      accent: stats.regearPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.regearPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.regearPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <PackageSearch size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold text-white">
          {tStats('shopRegearTitle', { days: stats.windowDays })}
        </h2>
      </div>

      <nav
        className="flex flex-wrap gap-2"
        aria-label={tStats('regearOriginFilterLabel')}
      >
        {(['all', 'event', 'free_window', 'auto'] as const).map((origin) => {
          const selected = origin === stats.regearOrigin
          const href =
            origin === 'all'
              ? '/admin/dashboard/stats'
              : `/admin/dashboard/stats?regearOrigin=${origin}`
          const labelKey =
            origin === 'event'
              ? 'regearOriginEvent'
              : origin === 'free_window'
                ? 'regearOriginFreeWindow'
                : origin === 'auto'
                  ? 'regearOriginAuto'
                  : 'regearOriginAll'
          return (
            <Link
              key={origin}
              href={href}
              aria-current={selected ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              {tStats(labelKey)}
            </Link>
          )
        })}
      </nav>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`${card.bg} ${card.ring} border rounded-lg p-4 space-y-2`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.accent} />
                <span className="text-xs text-gray-300">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${card.accent}`}>
                {card.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('topSoldTitle')}</h3>
          <span className="text-xs text-gray-500">
            {tStats('topSoldSubtitle', { count: stats.approvedItemMix.length })}
          </span>
        </header>
        {stats.approvedItemMix.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('topSoldEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ul"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="items"
          >
            {stats.approvedItemMix.map((item) => {
              const displayName =
                getLocalizedItemName(item.uniqueName, locale, item.nameKo) ?? item.nameKo
              return (
              <li
                key={`${item.uniqueName}@${item.enchant}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
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
