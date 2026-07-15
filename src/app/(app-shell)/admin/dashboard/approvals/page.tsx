import Link from 'next/link'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ShieldCheck, Wallet, ShoppingBag, Coins, ClipboardList, Handshake } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  listRegearRequests,
  listExchangeRequests,
  getRegearAnomalyMap,
  getRegearOriginCounts,
  getRegearRelationCounts,
  type RegearOrigin,
  type RegearOriginCounts,
  type RegearRelationCounts,
  type RegearRelationFilter,
} from '@/app/actions/regear-admin'
import { getRegearPayoutRatePercent } from '@/app/actions/regear-admin-types'
import { checkBuildSnapshotStockBatch } from '@/lib/inventory'
import { craftRegearSlots } from '@/lib/regear-craft-slots'
import type { BuildSnapshot } from '@/types'
import { listDonationRequests } from '@/app/actions/donation-admin'
import { listShopOrders } from '@/app/actions/shop-admin'
import { listAdminMemberTradeDisputes } from '@/app/actions/member-trade'
import { listEventPayoutRequests } from '@/app/actions/event-payout-admin'
import { listCraftOrderTasksForReview } from '@/app/actions/craft-orders'
import RegearReviewList from '@/components/RegearReviewList'
import ExchangeReviewList from '@/components/ExchangeReviewList'
import DonationReviewList from '@/components/DonationReviewList'
import ShopOrderReviewList from '@/components/ShopOrderReviewList'
import MemberTradeDisputeReviewList from '@/components/MemberTradeDisputeReviewList'
import EventPayoutReviewList from '@/components/EventPayoutReviewList'
import CraftOrderReviewList from '@/components/CraftOrderReviewList'
import ReorderableFilterChips from '@/components/ReorderableFilterChips'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { CAP } from '@/lib/permissions'
import {
  firstOrderedFilterValue,
  storedFilterOrderValues,
} from '@/lib/filter-order'
import { PageHeader } from '@/components/ui-patterns'

type TypeKey = 'regear' | 'exchange' | 'donation' | 'shop' | 'member_trade' | 'event_payout' | 'craft'
type Scope = 'pending' | 'all'

interface SearchParams {
  tab?: string
  scope?: string
  origin?: string
  relation?: string
  order?: string
}

function resolveType(v: string | undefined): TypeKey {
  if (
    v === 'exchange' ||
    v === 'donation' ||
    v === 'shop' ||
    v === 'member_trade' ||
    v === 'event_payout' ||
    v === 'craft'
  ) {
    return v
  }
  return 'regear'
}

const SCOPE_FILTER_ORDER = ['pending', 'all'] as const satisfies readonly Scope[]
const REGEAR_ORIGIN_FILTER_ORDER = [
  'auto',
  'manual',
  'all',
] as const satisfies readonly RegearOrigin[]
const REGEAR_RELATION_FILTER_ORDER = [
  'all',
  'home_guild',
  'alliance',
] as const satisfies readonly RegearRelationFilter[]

const ADMIN_FILTER_ORDER_STORAGE_KEYS = {
  regearOrigin: 'agm.filter-order.admin-approvals.regear-origin.v1',
  regearRelation: 'agm.filter-order.admin-approvals.regear-relation.v1',
  regearScope: 'agm.filter-order.admin-approvals.regear-scope.v1',
  exchangeScope: 'agm.filter-order.admin-approvals.exchange-scope.v1',
  donationScope: 'agm.filter-order.admin-approvals.donation-scope.v1',
  shopScope: 'agm.filter-order.admin-approvals.shop-scope.v1',
  memberTradeScope: 'agm.filter-order.admin-approvals.member-trade-scope.v1',
  eventPayoutScope: 'agm.filter-order.admin-approvals.event-payout-scope.v1',
  craftScope: 'agm.filter-order.admin-approvals.craft-scope.v1',
} as const

const ADMIN_SCOPE_FILTER_ORDER_STORAGE_KEYS: Record<TypeKey, string> = {
  regear: ADMIN_FILTER_ORDER_STORAGE_KEYS.regearScope,
  exchange: ADMIN_FILTER_ORDER_STORAGE_KEYS.exchangeScope,
  donation: ADMIN_FILTER_ORDER_STORAGE_KEYS.donationScope,
  shop: ADMIN_FILTER_ORDER_STORAGE_KEYS.shopScope,
  member_trade: ADMIN_FILTER_ORDER_STORAGE_KEYS.memberTradeScope,
  event_payout: ADMIN_FILTER_ORDER_STORAGE_KEYS.eventPayoutScope,
  craft: ADMIN_FILTER_ORDER_STORAGE_KEYS.craftScope,
}

function resolveScope(v: string | undefined, fallback: Scope): Scope {
  return v === 'pending' || v === 'all' ? v : fallback
}

function resolveOrigin(v: string | undefined, fallback: RegearOrigin): RegearOrigin {
  if (v === 'auto' || v === 'manual' || v === 'all') return v
  return fallback
}

function resolveRelation(
  v: string | undefined,
  fallback: RegearRelationFilter,
): RegearRelationFilter {
  if (v === 'all' || v === 'home_guild' || v === 'alliance') return v
  return fallback
}

const APPROVAL_TAB_CAPABILITIES: Record<TypeKey, readonly bigint[]> = {
  regear: [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION],
  exchange: [CAP.EXCHANGE_APPROVE],
  donation: [CAP.DONATION_APPROVE],
  shop: [CAP.INVENTORY_DELIVER, CAP.INVENTORY_MANAGE],
  member_trade: [CAP.INVENTORY_DELIVER, CAP.INVENTORY_MANAGE],
  event_payout: [CAP.EVENT_MANAGE],
  craft: [CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER],
}

function canAccessApprovalTab(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  key: TypeKey,
): boolean {
  if (session.isAdmin) return true
  const caps = APPROVAL_TAB_CAPABILITIES[key]
  if (caps.length === 0) return false
  return sessionHasAny(session, caps)
}

function approvalTabHref(key: TypeKey): string {
  return key === 'regear' ? '/admin/dashboard/approvals' : `/admin/dashboard/approvals?tab=${key}`
}

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [sp, cookieStore, session] = await Promise.all([
    searchParams,
    cookies(),
    getSession(),
  ])
  const type = resolveType(sp.tab)
  const scopeStorageKey = ADMIN_SCOPE_FILTER_ORDER_STORAGE_KEYS[type]
  const scopeOrder = storedFilterOrderValues(
    SCOPE_FILTER_ORDER,
    cookieStore.get(scopeStorageKey)?.value,
  )
  const originOrder = storedFilterOrderValues(
    REGEAR_ORIGIN_FILTER_ORDER,
    cookieStore.get(ADMIN_FILTER_ORDER_STORAGE_KEYS.regearOrigin)?.value,
  )
  const relationOrder = storedFilterOrderValues(
    REGEAR_RELATION_FILTER_ORDER,
    cookieStore.get(ADMIN_FILTER_ORDER_STORAGE_KEYS.regearRelation)?.value,
  )
  const scope = resolveScope(
    sp.scope,
    firstOrderedFilterValue(SCOPE_FILTER_ORDER, cookieStore.get(scopeStorageKey)?.value),
  )
  const origin = resolveOrigin(
    sp.origin,
    firstOrderedFilterValue(
      REGEAR_ORIGIN_FILTER_ORDER,
      cookieStore.get(ADMIN_FILTER_ORDER_STORAGE_KEYS.regearOrigin)?.value,
    ),
  )
  const relation = resolveRelation(
    sp.relation,
    firstOrderedFilterValue(
      REGEAR_RELATION_FILTER_ORDER,
      cookieStore.get(ADMIN_FILTER_ORDER_STORAGE_KEYS.regearRelation)?.value,
    ),
  )

  if (!session) {
    throw new Error('Unauthorized')
  }
  const guildId = await getSessionGuildId(session)
  const [tApprovals, badges] = await Promise.all([
    getTranslations('adminApprovals'),
    getAdminBadgeCounts(guildId),
  ])

  const allTabs: TabDef[] = [
    { key: 'regear', label: tApprovals('tabRegear'), icon: ShieldCheck, badge: badges.regear },
    { key: 'exchange', label: tApprovals('tabExchange'), icon: Wallet, badge: badges.exchange },
    { key: 'donation', label: tApprovals('tabDonation'), icon: Coins, badge: badges.donation },
    { key: 'shop', label: tApprovals('tabShop'), icon: ShoppingBag, badge: badges.shop },
    { key: 'member_trade', label: tApprovals('tabMemberTrade'), icon: Handshake, badge: badges.memberTrade },
    { key: 'event_payout', label: tApprovals('tabEventPayout'), icon: Coins, badge: badges.eventPayout },
    { key: 'craft', label: tApprovals('tabCraft'), icon: ClipboardList, badge: badges.craft },
  ]
  const tabs = allTabs.filter((tab) => canAccessApprovalTab(session, tab.key))
  if (tabs.length === 0) redirect('/admin')
  if (!canAccessApprovalTab(session, type)) redirect(approvalTabHref(tabs[0].key))
  const activeTab = tabs.find((tab) => tab.key === type) ?? tabs[0]
  const totalPending = tabs.reduce((sum, tab) => sum + tab.badge, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={tApprovals('pageTitle')}
        description={tApprovals('pageDescription')}
        meta={(
          <div className="inline-flex items-baseline gap-2 border-l-2 border-accent pl-3">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{totalPending}</span>
            <span className="text-sm text-muted">{tApprovals('pendingTotal')}</span>
          </div>
        )}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <TypeTabs
          active={type}
          tabs={tabs}
          tabsLabel={tApprovals('tabsLabel')}
          queueLabel={tApprovals('queueLabel')}
        />

        <section
          id="approval-panel"
          role="tabpanel"
          aria-labelledby={`approval-tab-${activeTab.key}`}
          className="min-w-0"
        >
          <header className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">
                {tApprovals('activeQueue')}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-foreground sm:text-xl">
                {activeTab.label}
              </h2>
            </div>
            <p className="shrink-0 text-sm text-muted">
              <span className="font-semibold tabular-nums text-foreground">{activeTab.badge}</span>{' '}
              {tApprovals('pendingShort')}
            </p>
          </header>

          <Suspense fallback={<ApprovalSectionSkeleton type={type} />}>
            {type === 'regear' && (
              <RegearSection
                scope={scope}
                origin={origin}
                relation={relation}
                scopeOrder={scopeOrder}
                originOrder={originOrder}
                relationOrder={relationOrder}
                guildId={guildId}
              />
            )}
            {type === 'exchange' && (
              <ExchangeSection scope={scope} scopeOrder={scopeOrder} guildId={guildId} />
            )}
            {type === 'donation' && (
              <DonationSection scope={scope} scopeOrder={scopeOrder} guildId={guildId} />
            )}
            {type === 'shop' && (
              <ShopSection
                scope={scope}
                scopeOrder={scopeOrder}
                guildId={guildId}
                focusedOrderId={sp.order ?? ''}
              />
            )}
            {type === 'member_trade' && (
              <MemberTradeSection scope={scope} scopeOrder={scopeOrder} guildId={guildId} />
            )}
            {type === 'event_payout' && (
              <EventPayoutSection scope={scope} scopeOrder={scopeOrder} guildId={guildId} />
            )}
            {type === 'craft' && (
              <CraftSection scope={scope} scopeOrder={scopeOrder} guildId={guildId} />
            )}
          </Suspense>
        </section>
      </div>
    </div>
  )
}

interface TabDef {
  key: TypeKey
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge: number
}

interface TypeTabsProps {
  active: TypeKey
  tabs: TabDef[]
  tabsLabel: string
  queueLabel: string
}

function TypeTabs({ active, tabs, tabsLabel, queueLabel }: TypeTabsProps) {
  return (
    <nav
      role="tablist"
      aria-label={tabsLabel}
      className="min-w-0 lg:sticky lg:top-16 lg:self-start"
    >
      <p className="mb-2 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle lg:block">
        {queueLabel}
      </p>
      <div className="-mx-4 flex snap-x gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:block lg:overflow-visible lg:border-b-0 lg:border-l lg:px-0">
        {tabs.map(({ key, label, icon: Icon, badge }) => {
          const isActive = active === key
          // Switching sections resets scope back to pending — the two params are
          // conceptually independent but operators almost always want to see the
          // pending queue first when they change type.
          const href = approvalTabHref(key)
          return (
            <Link
              id={`approval-tab-${key}`}
              key={key}
              href={href}
              role="tab"
              aria-selected={isActive}
              aria-controls="approval-panel"
              className={`flex min-h-11 shrink-0 snap-start items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors lg:min-h-12 lg:w-full lg:border-b-0 lg:border-l-2 lg:-ml-px ${
                isActive
                  ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                  : 'border-transparent text-muted hover:bg-surface-2 hover:text-foreground'
              }`}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span className="whitespace-nowrap lg:min-w-0 lg:flex-1 lg:truncate lg:text-left">{label}</span>
              <span
                className={`ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-5 tabular-nums ${
                  badge > 0
                    ? 'bg-danger text-danger-foreground'
                    : 'bg-surface-2 text-subtle'
                }`}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

interface ScopeTabsProps {
  baseHref: string
  active: Scope
  initialOrder: readonly Scope[]
  tKeys: {
    pending: string
    all: string
  }
  accent: 'amber' | 'emerald'
  storageKey: string
}

function ScopeTabs({
  baseHref,
  active,
  initialOrder,
  tKeys,
  accent,
  storageKey,
}: ScopeTabsProps) {
  const activeClass =
    accent === 'emerald'
      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
      : 'bg-amber-500/20 border-amber-500/50 text-amber-300'

  const scopes: Array<{ value: Scope; label: string }> = [
    { value: 'pending', label: tKeys.pending },
    { value: 'all', label: tKeys.all },
  ]

  return (
    <ReorderableFilterChips
      storageKey={storageKey}
      initialQueryParam="scope"
      initialOrder={initialOrder}
      activeValue={active}
      activeClassName={activeClass}
      items={scopes.map(({ value, label }) => ({
        value,
        label,
        href: value === 'pending'
          ? baseHref
          : `${baseHref}${baseHref.includes('?') ? '&' : '?'}scope=all`,
      }))}
    />
  )
}

function ApprovalSectionSkeleton({ type }: { type: TypeKey }) {
  const chipRows = type === 'regear' ? 3 : 1
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      {Array.from({ length: chipRows }).map((_, row) => (
        <div key={row} className="flex flex-wrap gap-2">
          <div className="h-8 w-24 rounded-full bg-gray-800" />
          <div className="h-8 w-20 rounded-full bg-gray-900" />
          <div className="h-8 w-24 rounded-full bg-gray-900" />
        </div>
      ))}
      <div className="divide-y divide-border border-y border-border">
        {Array.from({ length: 4 }).map((_, row) => (
          <div
            key={row}
            className="px-1 py-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-gray-800" />
                <div className="h-3 w-64 max-w-full rounded bg-gray-800" />
              </div>
              <div className="h-8 w-20 rounded-lg bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

async function RegearSection({
  scope,
  origin,
  relation,
  scopeOrder,
  originOrder,
  relationOrder,
  guildId,
}: {
  scope: Scope
  origin: RegearOrigin
  relation: RegearRelationFilter
  scopeOrder: readonly Scope[]
  originOrder: readonly RegearOrigin[]
  relationOrder: readonly RegearRelationFilter[]
  guildId: string
}) {
  const [
    { requests, error },
    t,
    ratePercent,
    { counts },
    { counts: relationCounts },
    timezone,
  ] = await Promise.all([
    listRegearRequests(scope, origin, relation),
    getTranslations('adminRegearReview'),
    getRegearPayoutRatePercent(),
    getRegearOriginCounts(scope, relation),
    getRegearRelationCounts(scope, origin),
    getTenantTimezone(guildId),
  ])
  // pending+crafted+build_snapshot 만 재고 체크 대상. 망토 토글에 따라 재고
  // 충분 여부가 달라지므로 cape 제외/포함 결과를 둘 다 계산한다.
  const craftedRequests = requests
    .filter((r) => r.status === 'pending' && r.fulfillment_mode === 'crafted' && r.build_snapshot)
  const stockEntriesWithoutCape = craftedRequests
    .map((r) => ({
      regearId: r.id,
      snapshot: r.build_snapshot as BuildSnapshot,
      includedSlots: craftRegearSlots(false),
    }))
  const stockEntriesWithCape = craftedRequests
    .map((r) => ({
      regearId: r.id,
      snapshot: r.build_snapshot as BuildSnapshot,
      includedSlots: craftRegearSlots(true),
    }))
  const [avatarMap, anomalies, stockChecks, stockChecksWithCape] = await Promise.all([
    getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id)),
    getRegearAnomalyMap(requests),
    stockEntriesWithoutCape.length > 0
      ? checkBuildSnapshotStockBatch(guildId, stockEntriesWithoutCape)
      : Promise.resolve({}),
    stockEntriesWithCape.length > 0
      ? checkBuildSnapshotStockBatch(guildId, stockEntriesWithCape)
      : Promise.resolve({}),
  ])
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <RegearOriginTabs
        active={origin}
        scope={scope}
        relation={relation}
        initialOrder={originOrder}
        counts={counts}
        tKeys={{
          auto: t('originAuto'),
          manual: t('originManual'),
          all: t('originAll'),
        }}
      />
      <RegearRelationTabs
        active={relation}
        scope={scope}
        origin={origin}
        initialOrder={relationOrder}
        counts={relationCounts}
        tKeys={{
          home_guild: t('relationHomeGuild'),
          alliance: t('relationAlliance'),
          all: t('relationAll'),
        }}
      />
      <ScopeTabs
        baseHref={regearBaseHref(origin, relation)}
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.regearScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {requests.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <RegearReviewList
          requests={requests}
          avatars={avatars}
          ratePercent={ratePercent}
          timezone={timezone}
          groupByEvent
          sortRowsByMember={origin === 'auto'}
          anomalies={anomalies}
          stockChecks={stockChecks}
          stockChecksWithCape={stockChecksWithCape}
        />
      )}
    </div>
  )
}

function regearBaseHref(origin: RegearOrigin, relation: RegearRelationFilter): string {
  const params = new URLSearchParams()
  if (origin !== 'auto') params.set('origin', origin)
  if (relation !== 'all') params.set('relation', relation)
  const qs = params.toString()
  return qs ? `/admin/dashboard/approvals?${qs}` : '/admin/dashboard/approvals'
}

interface RegearOriginTabsProps {
  active: RegearOrigin
  scope: Scope
  relation: RegearRelationFilter
  initialOrder: readonly RegearOrigin[]
  counts: RegearOriginCounts
  tKeys: {
    auto: string
    manual: string
    all: string
  }
}

function RegearOriginTabs({
  active,
  scope,
  relation,
  initialOrder,
  counts,
  tKeys,
}: RegearOriginTabsProps) {
  const origins: Array<{ value: RegearOrigin; label: string; count: number }> = [
    { value: 'auto', label: tKeys.auto, count: counts.auto },
    { value: 'manual', label: tKeys.manual, count: counts.manual },
    { value: 'all', label: tKeys.all, count: counts.all },
  ]
  return (
    <ReorderableFilterChips
      storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.regearOrigin}
      initialQueryParam="origin"
      initialOrder={initialOrder}
      activeValue={active}
      activeClassName="bg-sky-500/20 border-sky-500/50 text-sky-300"
      countActiveClassName="bg-sky-500/30 text-sky-200"
      items={origins.map(({ value, label, count }) => {
        const params = new URLSearchParams()
        if (value !== 'auto') params.set('origin', value)
        if (relation !== 'all') params.set('relation', relation)
        if (scope === 'all') params.set('scope', 'all')
        const qs = params.toString()
        return {
          value,
          label,
          count,
          href: qs ? `/admin/dashboard/approvals?${qs}` : '/admin/dashboard/approvals',
        }
      })}
    />
  )
}

interface RegearRelationTabsProps {
  active: RegearRelationFilter
  scope: Scope
  origin: RegearOrigin
  initialOrder: readonly RegearRelationFilter[]
  counts: RegearRelationCounts
  tKeys: {
    home_guild: string
    alliance: string
    all: string
  }
}

function RegearRelationTabs({
  active,
  scope,
  origin,
  initialOrder,
  counts,
  tKeys,
}: RegearRelationTabsProps) {
  const relations: Array<{ value: RegearRelationFilter; label: string; count: number }> = [
    { value: 'all', label: tKeys.all, count: counts.all },
    { value: 'home_guild', label: tKeys.home_guild, count: counts.home_guild },
    { value: 'alliance', label: tKeys.alliance, count: counts.alliance },
  ]
  return (
    <ReorderableFilterChips
      storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.regearRelation}
      initialQueryParam="relation"
      initialOrder={initialOrder}
      activeValue={active}
      activeClassName="bg-violet-500/20 border-violet-500/50 text-violet-300"
      countActiveClassName="bg-violet-500/30 text-violet-200"
      items={relations.map(({ value, label, count }) => {
        const params = new URLSearchParams()
        if (origin !== 'auto') params.set('origin', origin)
        if (value !== 'all') params.set('relation', value)
        if (scope === 'all') params.set('scope', 'all')
        const qs = params.toString()
        return {
          value,
          label,
          count,
          href: qs ? `/admin/dashboard/approvals?${qs}` : '/admin/dashboard/approvals',
        }
      })}
    />
  )
}

async function ExchangeSection({
  scope,
  scopeOrder,
  guildId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
}) {
  const [{ requests, error }, t, timezone] = await Promise.all([
    listExchangeRequests(scope),
    getTranslations('adminExchangeReview'),
    getTenantTimezone(guildId),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=exchange"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.exchangeScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {requests.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <ExchangeReviewList requests={requests} avatars={avatars} timezone={timezone} />
      )}
    </div>
  )
}

async function ShopSection({
  scope,
  scopeOrder,
  guildId,
  focusedOrderId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
  focusedOrderId: string
}) {
  const [{ orders, error }, t, timezone] = await Promise.all([
    listShopOrders(scope),
    getTranslations('adminShopReview'),
    getTenantTimezone(guildId),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, orders.map((o) => o.discordId))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=shop"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.shopScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {orders.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <ShopOrderReviewList
          orders={orders}
          avatars={avatars}
          timezone={timezone}
          focusedOrderId={focusedOrderId}
        />
      )}
    </div>
  )
}

async function MemberTradeSection({
  scope,
  scopeOrder,
  guildId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
}) {
  const [{ disputes, error }, t, timezone] = await Promise.all([
    listAdminMemberTradeDisputes(scope),
    getTranslations('adminMemberTradeReview'),
    getTenantTimezone(guildId),
  ])
  const discordIds = Array.from(
    new Set(disputes.flatMap((row) => [row.buyerDiscordId, row.sellerDiscordId])),
  )
  const avatarMap = await getAvatarsByDiscordIds(guildId, discordIds)
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=member_trade"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.memberTradeScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {disputes.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <MemberTradeDisputeReviewList
          disputes={disputes}
          avatars={avatars}
          timezone={timezone}
        />
      )}
    </div>
  )
}

async function EventPayoutSection({
  scope,
  scopeOrder,
  guildId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
}) {
  const [{ requests, error }, t, tz] = await Promise.all([
    listEventPayoutRequests(scope),
    getTranslations('adminEventPayoutReview'),
    getTenantTimezone(guildId),
  ])

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=event_payout"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.eventPayoutScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {requests.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <EventPayoutReviewList requests={requests} tz={tz} />
      )}
    </div>
  )
}

async function CraftSection({
  scope,
  scopeOrder,
  guildId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
}) {
  const [{ tasks, error }, t, timezone] = await Promise.all([
    listCraftOrderTasksForReview(scope),
    getTranslations('adminCraftOrderReview'),
    getTenantTimezone(guildId),
  ])
  const avatarMap = await getAvatarsByDiscordIds(
    guildId,
    tasks.map((task) => task.crafterDiscordId),
  )
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=craft"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.craftScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {tasks.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <CraftOrderReviewList tasks={tasks} avatars={avatars} timezone={timezone} />
      )}
    </div>
  )
}

async function DonationSection({
  scope,
  scopeOrder,
  guildId,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
  guildId: string
}) {
  const [{ requests, error }, t, timezone] = await Promise.all([
    listDonationRequests(scope),
    getTranslations('adminDonationReview'),
    getTenantTimezone(guildId),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=donation"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="emerald"
        storageKey={ADMIN_FILTER_ORDER_STORAGE_KEYS.donationScope}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {requests.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DonationReviewList requests={requests} avatars={avatars} timezone={timezone} />
      )}
    </div>
  )
}
