import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  History,
  ListChecks,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { getTenantTimezone } from '@/lib/timezone-server'
import ExchangeRequestActions from '@/components/ExchangeRequestActions'
import DonationRequestCancelButton from '@/components/DonationRequestCancelButton'
import {
  MEMBER_WORK_DOMAINS,
  type MemberWorkDomain,
  type MemberWorkInboxItem,
} from '@/lib/member-work-inbox'
import { loadMemberWorkInboxSnapshot } from '@/lib/member-work-inbox-server'

export const dynamic = 'force-dynamic'

const HISTORY_STAGES = [
  'completed',
  'rejected',
  'cancelled',
  'refunded',
  'expired',
  'exception',
] as const
type HistoryStage = (typeof HISTORY_STAGES)[number]
type HistoryPeriod = '30' | '90' | 'all'

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; status?: string; period?: string }>
}) {
  const [session, filters] = await Promise.all([getSession(), searchParams])
  if (!session) redirect('/login?returnTo=%2Fme%2Frequests')
  if (!session.isMember) redirect('/')

  const guildId = await getSessionGuildId(session)
  const [snapshot, t, tCommon, timezone] = await Promise.all([
    loadMemberWorkInboxSnapshot(
      getAdminClient(),
      guildId,
      session.discordId,
      { includeHistory: true, historyLimit: 200 },
    ),
    getTranslations('myRequests'),
    getTranslations('common'),
    getTenantTimezone(guildId),
  ])
  const domainFilter = isMemberWorkDomain(filters.domain) ? filters.domain : 'all'
  const statusFilter = isHistoryStage(filters.status) ? filters.status : 'all'
  const periodFilter = isHistoryPeriod(filters.period) ? filters.period : '90'
  const history = filterHistory(snapshot.history, {
    domain: domainFilter,
    status: statusFilter,
    period: periodFilter,
  })
  const hasHistoryFilter = domainFilter !== 'all' || statusFilter !== 'all' || periodFilter !== '90'

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <header>
        <Link
          href="/me"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
          <ListChecks size={22} className="text-amber-300" />
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {snapshot.activeCount > 0
            ? t('descriptionActive', {
                action: snapshot.actionRequiredCount,
                waiting: snapshot.waitingOnGuildCount,
              })
            : t('description')}
        </p>
      </header>

      {!snapshot.available && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{t('unavailable')}</span>
        </div>
      )}

      <WorkBucket
        title={t('actionRequiredTitle')}
        description={t('actionRequiredDescription')}
        empty={t('actionRequiredEmpty')}
        count={snapshot.actionRequiredCount}
        icon={<AlertCircle size={17} />}
        tone="action"
        items={snapshot.actionRequired}
        timezone={timezone}
        t={t}
      />

      <WorkBucket
        title={t('waitingTitle')}
        description={t('waitingDescription')}
        empty={t('waitingEmpty')}
        count={snapshot.waitingOnGuildCount}
        icon={<Clock3 size={17} />}
        tone="waiting"
        items={snapshot.waitingOnGuild}
        timezone={timezone}
        t={t}
      />

      <details
        open={hasHistoryFilter}
        className="group overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/45"
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-300">
              <History size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{t('historyTitle')}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{t('historyDescription')}</span>
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-gray-800 px-2 py-1 text-xs font-semibold text-gray-300">
            {snapshot.history.length}
          </span>
        </summary>
        <div className="space-y-4 border-t border-gray-800 p-3 sm:p-4">
          <HistoryFilters
            domain={domainFilter}
            status={statusFilter}
            period={periodFilter}
            t={t}
          />
          {history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-800 py-8 text-center text-sm text-gray-500">
              {t('historyEmpty')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-950/35">
              {history.map((item) => (
                <WorkItem key={item.itemKey} item={item} timezone={timezone} t={t} tone="history" />
              ))}
            </ul>
          )}
        </div>
      </details>
    </main>
  )
}

function WorkBucket({
  title,
  description,
  empty,
  count,
  icon,
  tone,
  items,
  timezone,
  t,
}: {
  title: string
  description: string
  empty: string
  count: number
  icon: React.ReactNode
  tone: 'action' | 'waiting'
  items: MemberWorkInboxItem[]
  timezone: string
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>
}) {
  const toneClass = tone === 'action'
    ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-sky-500/25 bg-sky-500/5'
  const iconClass = tone === 'action'
    ? 'bg-amber-500/15 text-amber-300'
    : 'bg-sky-500/15 text-sky-300'

  return (
    <section className={`overflow-hidden rounded-2xl border ${toneClass}`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            {icon}
          </span>
          <div>
            <h2 className="text-sm font-bold text-white">{title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-950/50 px-2 py-1 text-xs font-bold text-gray-200">
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 border-t border-white/5 px-4 py-4 text-xs text-gray-500 sm:px-5">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {empty}
        </div>
      ) : (
        <ul className="divide-y divide-white/5 border-t border-white/5 bg-gray-950/20">
          {items.map((item) => (
            <WorkItem key={item.itemKey} item={item} timezone={timezone} t={t} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  )
}

function WorkItem({
  item,
  timezone,
  t,
  tone,
}: {
  item: MemberWorkInboxItem
  timezone: string
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>
  tone: 'action' | 'waiting' | 'history'
}) {
  const stageClass = tone === 'action'
    ? 'bg-amber-500/15 text-amber-200'
    : tone === 'waiting'
      ? 'bg-sky-500/15 text-sky-200'
      : 'bg-gray-800 text-gray-300'
  const domainLabel = memberWorkDomainLabel(item.domain, t)
  const title = memberWorkTitle(item, t)

  return (
    <li id={`work-${item.domain}-${item.sourceId}`} className="px-4 py-3 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {domainLabel}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${stageClass}`}>
              {memberWorkStageLabel(item.stage, t)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-gray-100">{title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span>{t('createdAt', { when: formatDateTime(item.createdAt, timezone) })}</span>
            {item.dueAt && (
              <span className="font-semibold text-amber-300">
                {t('dueAt', { when: formatDateTime(item.dueAt, timezone) })}
              </span>
            )}
            {item.nextActor !== 'none' && (
              <span>{t('nextActor', { actor: memberWorkActorLabel(item.nextActor, t) })}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {item.amount !== null && (
            <p className="font-mono text-sm font-bold text-amber-200">
              {item.unit === 'points'
                ? t('amountPoints', { amount: item.amount.toLocaleString('en-US') })
                : formatSilver(item.amount)}
            </p>
          )}
          <Link
            href={item.href}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-amber-300"
          >
            {t('openOriginal')}
            <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>
      {item.bucket === 'waiting_on_guild' && item.domain === 'exchange' && (
        <div className="mt-2">
          <ExchangeRequestActions id={item.sourceId} silver={item.amount ?? 0} />
        </div>
      )}
      {item.bucket === 'waiting_on_guild' && item.domain === 'donation' && (
        <div className="mt-2">
          <DonationRequestCancelButton id={item.sourceId} />
        </div>
      )}
    </li>
  )
}

function HistoryFilters({
  domain,
  status,
  period,
  t,
}: {
  domain: MemberWorkDomain | 'all'
  status: HistoryStage | 'all'
  period: HistoryPeriod
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>
}) {
  return (
    <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="grid gap-1 text-[11px] font-semibold text-gray-500">
        {t('filterDomain')}
        <select name="domain" defaultValue={domain} className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-xs text-gray-200">
          <option value="all">{t('filterAll')}</option>
          {MEMBER_WORK_DOMAINS.map((value) => (
            <option key={value} value={value}>{memberWorkDomainLabel(value, t)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-semibold text-gray-500">
        {t('filterStatus')}
        <select name="status" defaultValue={status} className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-xs text-gray-200">
          <option value="all">{t('filterAll')}</option>
          {HISTORY_STAGES.map((value) => (
            <option key={value} value={value}>{memberWorkStageLabel(value, t)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-semibold text-gray-500">
        {t('filterPeriod')}
        <select name="period" defaultValue={period} className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-xs text-gray-200">
          <option value="30">{t('period30')}</option>
          <option value="90">{t('period90')}</option>
          <option value="all">{t('periodAll')}</option>
        </select>
      </label>
      <button type="submit" className="self-end rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200 hover:border-amber-500/50">
        {t('applyFilter')}
      </button>
    </form>
  )
}

function memberWorkDomainLabel(
  domain: MemberWorkDomain,
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>,
): string {
  switch (domain) {
    case 'regear': return t('domain.regear')
    case 'exchange': return t('domain.exchange')
    case 'donation': return t('domain.donation')
    case 'shop': return t('domain.shop')
    case 'member_trade': return t('domain.memberTrade')
    case 'craft': return t('domain.craft')
    case 'treasury_deposit': return t('domain.treasuryDeposit')
  }
}

function memberWorkTitle(
  item: MemberWorkInboxItem,
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>,
): string {
  if (item.title === 'exchange') return t('itemTitle.exchange')
  if (item.title === 'donation') return t('itemTitle.donation')
  if (item.title === 'shop') return t('itemTitle.shop')
  if (item.title === 'craft') return t('itemTitle.craft')
  if (item.title === 'regear') return t('itemTitle.regear')
  if (item.title === 'treasury_deposit') return t('itemTitle.treasuryDeposit')
  const itemCount = Number(item.metadata.itemCount)
  if (item.domain === 'shop' && Number.isInteger(itemCount) && itemCount > 1) {
    return t('itemTitle.shopWithCount', { name: item.title, count: itemCount })
  }
  return item.title
}

function memberWorkStageLabel(
  stage: string,
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>,
): string {
  switch (stage) {
    case 'regear_review': return t('stage.regearReview')
    case 'exchange_in_game_payout': return t('stage.exchangeInGamePayout')
    case 'donation_review': return t('stage.donationReview')
    case 'shop_price_confirmation': return t('stage.shopPriceConfirmation')
    case 'shop_preparing': return t('stage.shopPreparing')
    case 'shop_review': return t('stage.shopReview')
    case 'trade_seller_delivery': return t('stage.tradeSellerDelivery')
    case 'trade_waiting_seller': return t('stage.tradeWaitingSeller')
    case 'trade_buyer_receipt': return t('stage.tradeBuyerReceipt')
    case 'trade_waiting_buyer': return t('stage.tradeWaitingBuyer')
    case 'trade_dispute_review': return t('stage.tradeDisputeReview')
    case 'craft_queue': return t('stage.craftQueue')
    case 'craft_in_progress': return t('stage.craftInProgress')
    case 'craft_pickup': return t('stage.craftPickup')
    case 'treasury_purpose': return t('stage.treasuryPurpose')
    case 'completed': return t('stage.completed')
    case 'rejected': return t('stage.rejected')
    case 'cancelled': return t('stage.cancelled')
    case 'refunded': return t('stage.refunded')
    case 'expired': return t('stage.expired')
    case 'exception': return t('stage.exception')
    default: return t('stage.unknown')
  }
}

function memberWorkActorLabel(
  actor: MemberWorkInboxItem['nextActor'],
  t: Awaited<ReturnType<typeof getTranslations<'myRequests'>>>,
): string {
  switch (actor) {
    case 'member': return t('actor.member')
    case 'guild': return t('actor.guild')
    case 'counterparty': return t('actor.counterparty')
    case 'operator': return t('actor.operator')
    case 'none': return ''
  }
}

function isMemberWorkDomain(value: string | undefined): value is MemberWorkDomain {
  return typeof value === 'string' && (MEMBER_WORK_DOMAINS as readonly string[]).includes(value)
}

function isHistoryStage(value: string | undefined): value is HistoryStage {
  return typeof value === 'string' && (HISTORY_STAGES as readonly string[]).includes(value)
}

function isHistoryPeriod(value: string | undefined): value is HistoryPeriod {
  return value === '30' || value === '90' || value === 'all'
}

function filterHistory(
  items: MemberWorkInboxItem[],
  filters: {
    domain: MemberWorkDomain | 'all'
    status: HistoryStage | 'all'
    period: HistoryPeriod
  },
): MemberWorkInboxItem[] {
  const cutoff = filters.period === 'all'
    ? null
    : Date.now() - Number(filters.period) * 24 * 60 * 60 * 1000
  return items.filter((item) => (
    (filters.domain === 'all' || item.domain === filters.domain) &&
    (filters.status === 'all' || item.stage === filters.status) &&
    (cutoff === null || Date.parse(item.updatedAt) >= cutoff)
  ))
}
