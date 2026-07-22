import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyRegearRequests } from '@/app/actions/regear'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyDonationRequests } from '@/app/actions/donation'
import { getMyShopOrderCounts, listMyShopOrders } from '@/app/actions/shop-member'
import {
  getMyMemberTradeOrderCounts,
  listMyMemberTradeOrders,
} from '@/app/actions/member-trade'
import { getSessionGuildId } from '@/lib/tenant'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { getTenantTimezone } from '@/lib/timezone-server'
import ExchangeRequestActions from '@/components/ExchangeRequestActions'
import DonationRequestCancelButton from '@/components/DonationRequestCancelButton'
import MyRegearList from '@/components/MyRegearList'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

function sortPendingFirst<T extends { status: string; created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    if (aPending !== bPending) return aPending - bPending
    return b.created_at.localeCompare(a.created_at)
  })
}

export default async function MyRequestsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/requests')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [
    { requests: regears },
    { requests: exchanges },
    { requests: donations },
    shopOrders,
    { orders: memberTradeOrders },
    shopOrderCounts,
    memberTradeOrderCounts,
    t,
    tMe,
    tCommon,
    tStatus,
    tz,
  ] = await Promise.all([
    listMyRegearRequests(),
    listMyExchangeRequests(),
    listMyDonationRequests(),
    listMyShopOrders(20),
    listMyMemberTradeOrders(),
    getMyShopOrderCounts(),
    getMyMemberTradeOrderCounts(),
    getTranslations('myRequests'),
    getTranslations('me'),
    getTranslations('common'),
    getTranslations('status'),
    getTenantTimezone(guildId),
  ])

  const sortedExchanges = sortPendingFirst(exchanges)
  const sortedDonations = sortPendingFirst(donations)
  const requestTimeline = [
    ...regears.map((request) => ({
      id: `regear:${request.id}`,
      kind: t('timelineRegear'),
      title: request.event_title,
      status: request.status,
      amount: request.payout_silver ?? request.claimed_silver ?? request.silver,
      unit: 'silver' as const,
      createdAt: request.created_at,
      href: `/me/regear/${request.id}`,
    })),
    ...exchanges.map((request) => ({
      id: `exchange:${request.id}`,
      kind: t('timelineExchange'),
      title: t('timelineExchangeTitle'),
      status: request.status,
      amount: request.silver,
      unit: 'silver' as const,
      createdAt: request.created_at,
      href: '/me/wallet',
    })),
    ...donations.map((request) => ({
      id: `donation:${request.id}`,
      kind: t('timelineDonation'),
      title: request.memo || t('timelineDonationTitle'),
      status: request.status,
      amount: request.silver,
      unit: 'silver' as const,
      createdAt: request.created_at,
      href: '/me/requests',
    })),
    ...shopOrders.map((order) => ({
      id: `shop:${order.id}`,
      kind: t('timelineShop'),
      title: t('timelineShopTitle', { count: order.items.length }),
      status: order.status,
      amount: order.totalPoints,
      unit: 'points' as const,
      createdAt: order.createdAt,
      href: '/shop',
    })),
    ...memberTradeOrders.map((order) => ({
      id: `member-trade:${order.id}`,
      kind: t('timelineMemberTrade'),
      title: order.listingTitle || order.nameKo,
      status: order.status,
      amount: order.totalPoints,
      unit: 'points' as const,
      createdAt: order.createdAt,
      href: '/market',
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 30)

  const pendingTotal =
    regears.filter((r) => r.status === 'pending').length +
    exchanges.filter((e) => e.status === 'pending').length +
    donations.filter((d) => d.status === 'pending').length +
    shopOrderCounts.active +
    memberTradeOrderCounts.active

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-2"
        >
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
        <p className="text-gray-400 text-sm">
          {pendingTotal > 0 ? t('descriptionPending', { count: pendingTotal }) : t('description')}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <RequestSummaryCard
          label={tMe('regearListTitle')}
          total={regears.length}
          pending={regears.filter((r) => r.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={tMe('exchangeTitle')}
          total={exchanges.length}
          pending={exchanges.filter((e) => e.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={tMe('donationTitle')}
          total={donations.length}
          pending={donations.filter((d) => d.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={t('timelineShop')}
          total={shopOrderCounts.total}
          pending={shopOrderCounts.active}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={t('timelineMemberTrade')}
          total={memberTradeOrderCounts.total}
          pending={memberTradeOrderCounts.active}
          pendingLabel={t('summaryActive')}
          totalLabel={t('summaryTotal')}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t('timelineTitle')}</h2>
          <p className="mt-1 text-xs text-gray-500">{t('timelineDescription')}</p>
        </div>
        {requestTimeline.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-800 py-8 text-center text-sm text-gray-500">
            {t('timelineEmpty')}
          </p>
        ) : (
          <ol className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
            {requestTimeline.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-gray-800/60"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {entry.kind}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(entry.status)}`}>
                        {timelineStatusLabel(t, entry.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-100">{entry.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-600">{formatDateTime(entry.createdAt, tz)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-amber-300">
                    {entry.unit === 'points'
                      ? t('timelinePoints', { amount: entry.amount.toLocaleString() })
                      : formatSilver(entry.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">{tMe('regearListTitle')}</h2>
        <MyRegearList requests={regears} timezone={tz} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">{tMe('exchangeTitle')}</h2>
        {sortedExchanges.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{tMe('noExchanges')}</p>
        ) : (
          <ul className="space-y-2">
            {sortedExchanges.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-mono">{formatSilver(e.silver)}</p>
                  <p className="text-gray-500 text-xs">{tMe('requestedAt', { when: formatDateTime(e.created_at, tz) })}</p>
                  {e.resolved_at && e.status !== 'pending' && (
                    <p className="text-gray-500 text-xs">
                      {tStatus(e.status)} {formatDateTime(e.resolved_at, tz)}
                      {e.handled_by_username && (
                        <span className="ml-2 text-gray-600">
                          · {tMe('handledBy', { handler: e.handled_by_username })}
                        </span>
                      )}
                    </p>
                  )}
                  {e.admin_notes && (
                    <p className="text-gray-400 text-xs mt-1 truncate">{tMe('reason', { text: e.admin_notes })}</p>
                  )}
                  {e.status === 'pending' && (
                    <ExchangeRequestActions id={e.id} silver={e.silver} />
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[e.status]}`}>
                  {tStatus(e.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">{tMe('donationTitle')}</h2>
        {sortedDonations.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{tMe('noDonations')}</p>
        ) : (
          <ul className="space-y-2">
            {sortedDonations.map((d) => (
              <li
                key={d.id}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-sm font-mono">
                    {tMe('donationAmount', { amount: formatSilver(d.silver) })}
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[d.status]}`}>
                    {tStatus(d.status)}
                  </span>
                </div>
                {d.memo && (
                  <p className="text-gray-400 text-xs whitespace-pre-wrap">{d.memo}</p>
                )}
                {d.admin_notes && (
                  <p className="text-gray-500 text-xs truncate">{d.admin_notes}</p>
                )}
                <p className="text-gray-600 text-xs font-mono">
                  {tMe('requestedAt', { when: formatDateTime(d.created_at, tz) })}
                  {d.resolved_at && d.status !== 'pending' && (
                    <span className="ml-2">
                      · {tStatus(d.status)} {formatDateTime(d.resolved_at, tz)}
                      {d.handled_by_username && (
                        <span className="ml-1 text-gray-700">
                          · {tMe('handledBy', { handler: d.handled_by_username })}
                        </span>
                      )}
                    </span>
                  )}
                </p>
                {d.status === 'pending' && <DonationRequestCancelButton id={d.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function statusTone(status: string): string {
  if (status === 'approved' || status === 'completed') return 'bg-emerald-500/20 text-emerald-300'
  if (status === 'pending' || status === 'awaiting_delivery' || status === 'delivered') {
    return 'bg-amber-500/20 text-amber-300'
  }
  if (status === 'disputed') return 'bg-red-500/20 text-red-300'
  return 'bg-gray-800 text-gray-400'
}

function timelineStatusLabel(
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>,
  status: string,
): string {
  if (
    status === 'pending' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'awaiting_delivery' ||
    status === 'delivered' ||
    status === 'completed' ||
    status === 'disputed' ||
    status === 'refunded'
  ) {
    return t(`timelineStatus.${status}`)
  }
  return t('timelineStatus.unknown')
}

function RequestSummaryCard({
  label,
  total,
  pending,
  pendingLabel,
  totalLabel,
}: {
  label: string
  total: number
  pending: number
  pendingLabel: string
  totalLabel: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{pending}</p>
          <p className="text-[11px] text-amber-300">{pendingLabel}</p>
        </div>
        <p className="text-xs text-gray-500">
          {totalLabel} <span className="font-mono text-gray-300">{total}</span>
        </p>
      </div>
    </div>
  )
}
