import Link from 'next/link'
import { cookies } from 'next/headers'
import { ShieldCheck, Wallet, ShoppingBag, Coins, ClipboardList, Handshake } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  DEMO_REGEAR_LIST,
  DEMO_EXCHANGE_REQUESTS,
  DEMO_DONATION_REQUESTS,
  DEMO_SHOP_ORDERS,
  DEMO_MEMBER_TRADE_DISPUTES,
  DEMO_EVENT_PAYOUTS,
  DEMO_CRAFT_ORDERS,
  DEMO_ADMIN_BADGES,
  type DemoRegearListItem,
} from '@/data/demo-seed'
import {
  DemoRegearReviewList,
  DemoExchangeReviewList,
  DemoDonationReviewList,
  DemoShopOrderReviewList,
  DemoMemberTradeDisputeReviewList,
  DemoEventPayoutReviewList,
  DemoCraftOrderReviewList,
} from '../_components/DemoApprovalLists'
import ReorderableFilterChips from '@/components/ReorderableFilterChips'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import DemoCTACard from '../_components/DemoCTACard'
import {
  firstOrderedFilterValue,
  storedFilterOrderValues,
} from '@/lib/filter-order'
import { PageHeader } from '@/components/ui-patterns'
import { getQueueCountTone } from '@/lib/visual-refresh'

const REGEAR_TOUR_STEPS = [
  { id: 'regear-types' },
  { id: 'regear-origin' },
  { id: 'regear-list' },
] as const

// `/admin/dashboard/approvals` 의 1:1 비주얼 클론.
// - 6 TYPE 탭 (regear/exchange/donation/shop/event_payout/craft) + 배지 카운트.
// - regear 만 RegearOriginTabs (auto/manual/all + count) 추가.
// - 모든 섹션에 ScopeTabs (대기중/전체) — 포인트 환전만 emerald accent, 나머지 amber.
// - 카드 외관과 disabled 액션 버튼은 실제 ReviewList 와 동일.

type TypeKey = 'regear' | 'exchange' | 'donation' | 'shop' | 'member_trade' | 'event_payout' | 'craft'
type Scope = 'pending' | 'all'
type RegearOrigin = 'auto' | 'manual' | 'all'

interface SearchParams {
  tab?: string
  scope?: string
  origin?: string
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

const DEMO_FILTER_ORDER_STORAGE_KEYS = {
  regearOrigin: 'agm.filter-order.demo-approvals.regear-origin.v1',
  regearScope: 'agm.filter-order.demo-approvals.regear-scope.v1',
  exchangeScope: 'agm.filter-order.demo-approvals.exchange-scope.v1',
  donationScope: 'agm.filter-order.demo-approvals.donation-scope.v1',
  shopScope: 'agm.filter-order.demo-approvals.shop-scope.v1',
  memberTradeScope: 'agm.filter-order.demo-approvals.member-trade-scope.v1',
  eventPayoutScope: 'agm.filter-order.demo-approvals.event-payout-scope.v1',
  craftScope: 'agm.filter-order.demo-approvals.craft-scope.v1',
} as const

const DEMO_SCOPE_FILTER_ORDER_STORAGE_KEYS: Record<TypeKey, string> = {
  regear: DEMO_FILTER_ORDER_STORAGE_KEYS.regearScope,
  exchange: DEMO_FILTER_ORDER_STORAGE_KEYS.exchangeScope,
  donation: DEMO_FILTER_ORDER_STORAGE_KEYS.donationScope,
  shop: DEMO_FILTER_ORDER_STORAGE_KEYS.shopScope,
  member_trade: DEMO_FILTER_ORDER_STORAGE_KEYS.memberTradeScope,
  event_payout: DEMO_FILTER_ORDER_STORAGE_KEYS.eventPayoutScope,
  craft: DEMO_FILTER_ORDER_STORAGE_KEYS.craftScope,
}

function resolveScope(v: string | undefined, fallback: Scope): Scope {
  return v === 'pending' || v === 'all' ? v : fallback
}

function resolveOrigin(v: string | undefined, fallback: RegearOrigin): RegearOrigin {
  if (v === 'auto' || v === 'manual' || v === 'all') return v
  return fallback
}

export default async function DemoApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const type = resolveType(sp.tab)
  const cookieStore = await cookies()
  const scopeStorageKey = DEMO_SCOPE_FILTER_ORDER_STORAGE_KEYS[type]
  const scopeOrder = storedFilterOrderValues(
    SCOPE_FILTER_ORDER,
    cookieStore.get(scopeStorageKey)?.value,
  )
  const originOrder = storedFilterOrderValues(
    REGEAR_ORIGIN_FILTER_ORDER,
    cookieStore.get(DEMO_FILTER_ORDER_STORAGE_KEYS.regearOrigin)?.value,
  )
  const scope = resolveScope(
    sp.scope,
    firstOrderedFilterValue(SCOPE_FILTER_ORDER, cookieStore.get(scopeStorageKey)?.value),
  )
  const origin = resolveOrigin(
    sp.origin,
    firstOrderedFilterValue(
      REGEAR_ORIGIN_FILTER_ORDER,
      cookieStore.get(DEMO_FILTER_ORDER_STORAGE_KEYS.regearOrigin)?.value,
    ),
  )

  const [tApprovals, tCta] = await Promise.all([
    getTranslations('adminApprovals'),
    getTranslations('demo.ctaCard'),
  ])

  const tabs: TabDef[] = [
    { key: 'regear', label: tApprovals('tabRegear'), icon: ShieldCheck, badge: DEMO_ADMIN_BADGES.regear },
    { key: 'exchange', label: tApprovals('tabExchange'), icon: Wallet, badge: DEMO_ADMIN_BADGES.exchange },
    { key: 'donation', label: tApprovals('tabDonation'), icon: Coins, badge: DEMO_ADMIN_BADGES.donation },
    { key: 'shop', label: tApprovals('tabShop'), icon: ShoppingBag, badge: DEMO_ADMIN_BADGES.shop },
    { key: 'member_trade', label: tApprovals('tabMemberTrade'), icon: Handshake, badge: DEMO_ADMIN_BADGES.memberTrade },
    { key: 'event_payout', label: tApprovals('tabEventPayout'), icon: Coins, badge: DEMO_ADMIN_BADGES.eventPayout },
    { key: 'craft', label: tApprovals('tabCraft'), icon: ClipboardList, badge: DEMO_ADMIN_BADGES.craft },
  ]

  return (
    <div className="v3-approval-workspace space-y-4">
      <DemoGuidedTour steps={REGEAR_TOUR_STEPS} namespace="regear" />
      <PageHeader
        title={tApprovals('pageTitle')}
        description={tApprovals('pageDescription')}
        meta={(
          <div className="inline-flex items-baseline gap-2 border-l-2 border-accent pl-3">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {tabs.reduce((sum, tab) => sum + tab.badge, 0)}
            </span>
            <span className="text-sm text-muted">{tApprovals('pendingTotal')}</span>
          </div>
        )}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <div data-tour-id="regear-types" className="min-w-0">
          <TypeTabs active={type} tabs={tabs} tabsLabel={tApprovals('tabsLabel')} />
        </div>

        <section className="min-w-0">
          {type === 'regear' && (
            <RegearSection
              scope={scope}
              origin={origin}
              scopeOrder={scopeOrder}
              originOrder={originOrder}
            />
          )}
          {type === 'exchange' && <ExchangeSection scope={scope} scopeOrder={scopeOrder} />}
          {type === 'donation' && <DonationSection scope={scope} scopeOrder={scopeOrder} />}
          {type === 'shop' && <ShopSection scope={scope} scopeOrder={scopeOrder} />}
          {type === 'member_trade' && (
            <MemberTradeSection scope={scope} scopeOrder={scopeOrder} />
          )}
          {type === 'event_payout' && (
            <EventPayoutSection scope={scope} scopeOrder={scopeOrder} />
          )}
          {type === 'craft' && <CraftSection scope={scope} scopeOrder={scopeOrder} />}
        </section>
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('regear.title')}
        description={tCta('regear.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

interface TabDef {
  key: TypeKey
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge: number
}

function TypeTabs({
  active,
  tabs,
  tabsLabel,
}: {
  active: TypeKey
  tabs: TabDef[]
  tabsLabel: string
}) {
  return (
    <nav aria-label={tabsLabel} className="min-w-0 lg:sticky lg:top-16 lg:self-start">
      <div
        role="tablist"
        className="-mx-4 flex snap-x gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:block lg:overflow-visible lg:border-b-0 lg:border-l lg:px-0"
      >
      {tabs.map(({ key, label, icon: Icon, badge }) => {
        const isActive = active === key
        const countTone = getQueueCountTone({ count: badge, isOverdue: false })
        const href = key === 'regear' ? '/demo/regear' : `/demo/regear?tab=${key}`
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`flex min-h-11 shrink-0 snap-start items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors lg:min-h-12 lg:w-full lg:border-b-0 lg:border-l-2 lg:-ml-px ${
              isActive
                ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                : 'border-transparent text-muted hover:bg-surface-2 hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
            <span className={`ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-5 tabular-nums ${
              countTone === 'danger'
                ? 'bg-danger text-danger-foreground'
                : countTone === 'attention'
                  ? 'bg-accent-soft text-accent-soft-foreground'
                  : 'bg-surface-2 text-subtle'
            }`}>
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
  tKeys: { pending: string; all: string }
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

async function RegearSection({
  scope,
  origin,
  scopeOrder,
  originOrder,
}: {
  scope: Scope
  origin: RegearOrigin
  scopeOrder: readonly Scope[]
  originOrder: readonly RegearOrigin[]
}) {
  const t = await getTranslations('adminRegearReview')

  const filtered = filterRegear(DEMO_REGEAR_LIST, scope, origin)
  const counts = countRegear(scope)

  return (
    <div className="space-y-4">
      <div data-tour-id="regear-origin">
        <RegearOriginTabs
          active={origin}
          scope={scope}
          initialOrder={originOrder}
          counts={counts}
          tKeys={{
            auto: t('originAuto'),
            manual: t('originManual'),
            all: t('originAll'),
          }}
        />
      </div>
      <ScopeTabs
        baseHref={originBaseHref(origin)}
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.regearScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <div data-tour-id="regear-list">
          <DemoRegearReviewList requests={filtered} />
        </div>
      )}
    </div>
  )
}

function originBaseHref(origin: RegearOrigin): string {
  return origin === 'auto' ? '/demo/regear' : `/demo/regear?origin=${origin}`
}

interface RegearOriginTabsProps {
  active: RegearOrigin
  scope: Scope
  initialOrder: readonly RegearOrigin[]
  counts: { auto: number; manual: number; all: number }
  tKeys: { auto: string; manual: string; all: string }
}

function RegearOriginTabs({
  active,
  scope,
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
      storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.regearOrigin}
      initialQueryParam="origin"
      initialOrder={initialOrder}
      activeValue={active}
      activeClassName="bg-sky-500/20 border-sky-500/50 text-sky-300"
      countActiveClassName="bg-sky-500/30 text-sky-200"
      items={origins.map(({ value, label, count }) => {
        const params = new URLSearchParams()
        if (value !== 'auto') params.set('origin', value)
        if (scope === 'all') params.set('scope', 'all')
        const qs = params.toString()
        return {
          value,
          label,
          count,
          href: qs ? `/demo/regear?${qs}` : '/demo/regear',
        }
      })}
    />
  )
}

function filterRegear(
  list: DemoRegearListItem[],
  scope: Scope,
  origin: RegearOrigin,
): DemoRegearListItem[] {
  return list.filter((r) => {
    if (scope === 'pending' && r.status !== 'pending') return false
    if (origin !== 'all' && r.origin !== origin) return false
    return true
  })
}

function countRegear(scope: Scope): { auto: number; manual: number; all: number } {
  const list = scope === 'pending'
    ? DEMO_REGEAR_LIST.filter((r) => r.status === 'pending')
    : DEMO_REGEAR_LIST
  return {
    auto: list.filter((r) => r.origin === 'auto').length,
    manual: list.filter((r) => r.origin === 'manual').length,
    all: list.length,
  }
}

async function ExchangeSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminExchangeReview')
  const filtered = scope === 'pending'
    ? DEMO_EXCHANGE_REQUESTS.filter((r) => r.status === 'pending')
    : DEMO_EXCHANGE_REQUESTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=exchange"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.exchangeScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoExchangeReviewList requests={filtered} />
      )}
    </div>
  )
}

async function DonationSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminDonationReview')
  const filtered = scope === 'pending'
    ? DEMO_DONATION_REQUESTS.filter((r) => r.status === 'pending')
    : DEMO_DONATION_REQUESTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=donation"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="emerald"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.donationScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoDonationReviewList requests={filtered} />
      )}
    </div>
  )
}

async function ShopSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminShopReview')
  const filtered = scope === 'pending'
    ? DEMO_SHOP_ORDERS.filter((o) => o.status === 'pending')
    : DEMO_SHOP_ORDERS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=shop"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.shopScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoShopOrderReviewList orders={filtered} />
      )}
    </div>
  )
}

async function MemberTradeSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminMemberTradeReview')
  const filtered = scope === 'pending'
    ? DEMO_MEMBER_TRADE_DISPUTES.filter((row) => row.status === 'disputed')
    : DEMO_MEMBER_TRADE_DISPUTES
  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=member_trade"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.memberTradeScope}
      />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoMemberTradeDisputeReviewList disputes={filtered} />
      )}
    </div>
  )
}

async function EventPayoutSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminEventPayoutReview')
  const filtered = scope === 'pending'
    ? DEMO_EVENT_PAYOUTS.filter((e) => e.status === 'pending')
    : DEMO_EVENT_PAYOUTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=event_payout"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.eventPayoutScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoEventPayoutReviewList requests={filtered} />
      )}
    </div>
  )
}

async function CraftSection({
  scope,
  scopeOrder,
}: {
  scope: Scope
  scopeOrder: readonly Scope[]
}) {
  const t = await getTranslations('adminCraftOrderReview')
  const filtered = scope === 'pending'
    ? DEMO_CRAFT_ORDERS.filter((c) => c.status === 'pending')
    : DEMO_CRAFT_ORDERS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=craft"
        active={scope}
        initialOrder={scopeOrder}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
        storageKey={DEMO_FILTER_ORDER_STORAGE_KEYS.craftScope}
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DemoCraftOrderReviewList tasks={filtered} />
      )}
    </div>
  )
}
