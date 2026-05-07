import Link from 'next/link'
import { ShieldCheck, Wallet, Gift, ShoppingBag, Coins, ClipboardList } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  DEMO_REGEAR_LIST,
  DEMO_EXCHANGE_REQUESTS,
  DEMO_DONATION_REQUESTS,
  DEMO_SHOP_ORDERS,
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
  DemoEventPayoutReviewList,
  DemoCraftOrderReviewList,
} from '../_components/DemoApprovalLists'
import DemoGuidedTour from '../_components/DemoGuidedTour'

const REGEAR_TOUR_STEPS = [
  { id: 'regear-types' },
  { id: 'regear-origin' },
  { id: 'regear-list' },
] as const

// `/admin/dashboard/approvals` 의 1:1 비주얼 클론.
// - 6 TYPE 탭 (regear/exchange/donation/shop/event_payout/craft) + 배지 카운트.
// - regear 만 RegearOriginTabs (auto/manual/all + count) 추가.
// - 모든 섹션에 ScopeTabs (대기중/전체) — donation 만 emerald accent, 나머지 amber.
// - 카드 외관과 disabled 액션 버튼은 실제 ReviewList 와 동일.

type TypeKey = 'regear' | 'exchange' | 'donation' | 'shop' | 'event_payout' | 'craft'
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
    v === 'event_payout' ||
    v === 'craft'
  ) {
    return v
  }
  return 'regear'
}

function resolveScope(v: string | undefined): Scope {
  return v === 'all' ? 'all' : 'pending'
}

function resolveOrigin(v: string | undefined): RegearOrigin {
  if (v === 'manual' || v === 'all') return v
  return 'auto'
}

export default async function DemoApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const type = resolveType(sp.tab)
  const scope = resolveScope(sp.scope)
  const origin = resolveOrigin(sp.origin)

  const tApprovals = await getTranslations('adminApprovals')

  const tabs: TabDef[] = [
    { key: 'regear', label: tApprovals('tabRegear'), icon: ShieldCheck, badge: DEMO_ADMIN_BADGES.regear },
    { key: 'exchange', label: tApprovals('tabExchange'), icon: Wallet, badge: DEMO_ADMIN_BADGES.exchange },
    { key: 'donation', label: tApprovals('tabDonation'), icon: Gift, badge: DEMO_ADMIN_BADGES.donation },
    { key: 'shop', label: tApprovals('tabShop'), icon: ShoppingBag, badge: DEMO_ADMIN_BADGES.shop },
    { key: 'event_payout', label: tApprovals('tabEventPayout'), icon: Coins, badge: DEMO_ADMIN_BADGES.eventPayout },
    { key: 'craft', label: tApprovals('tabCraft'), icon: ClipboardList, badge: DEMO_ADMIN_BADGES.craft },
  ]

  return (
    <div className="space-y-4">
      <DemoGuidedTour steps={REGEAR_TOUR_STEPS} namespace="regear" />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{tApprovals('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{tApprovals('pageDescription')}</p>
      </div>

      <div data-tour-id="regear-types">
        <TypeTabs active={type} tabs={tabs} tabsLabel={tApprovals('tabsLabel')} />
      </div>

      {type === 'regear' && <RegearSection scope={scope} origin={origin} />}
      {type === 'exchange' && <ExchangeSection scope={scope} />}
      {type === 'donation' && <DonationSection scope={scope} />}
      {type === 'shop' && <ShopSection scope={scope} />}
      {type === 'event_payout' && <EventPayoutSection scope={scope} />}
      {type === 'craft' && <CraftSection scope={scope} />}
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
    <nav
      role="tablist"
      aria-label={tabsLabel}
      className="flex gap-1 border-b border-gray-800 overflow-x-auto"
    >
      {tabs.map(({ key, label, icon: Icon, badge }) => {
        const isActive = active === key
        const hasBadge = badge > 0
        const href = key === 'regear' ? '/demo/regear' : `/demo/regear?tab=${key}`
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              isActive
                ? 'text-amber-300 border-amber-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
            {hasBadge && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

interface ScopeTabsProps {
  baseHref: string
  active: Scope
  tKeys: { pending: string; all: string }
  accent: 'amber' | 'emerald'
}

function ScopeTabs({ baseHref, active, tKeys, accent }: ScopeTabsProps) {
  const activeClass =
    accent === 'emerald'
      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
      : 'bg-amber-500/20 border-amber-500/50 text-amber-300'

  const scopes: Array<{ value: Scope; label: string }> = [
    { value: 'pending', label: tKeys.pending },
    { value: 'all', label: tKeys.all },
  ]

  return (
    <nav className="flex items-center gap-2">
      {scopes.map(({ value, label }) => {
        const isActive = active === value
        const href = value === 'pending' ? baseHref : `${baseHref}${baseHref.includes('?') ? '&' : '?'}scope=all`
        return (
          <Link
            key={value}
            href={href}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
              isActive ? activeClass : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

async function RegearSection({ scope, origin }: { scope: Scope; origin: RegearOrigin }) {
  const t = await getTranslations('adminRegearReview')

  const filtered = filterRegear(DEMO_REGEAR_LIST, scope, origin)
  const counts = countRegear(scope)

  return (
    <div className="space-y-4">
      <div data-tour-id="regear-origin">
        <RegearOriginTabs
          active={origin}
          scope={scope}
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
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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
  counts: { auto: number; manual: number; all: number }
  tKeys: { auto: string; manual: string; all: string }
}

function RegearOriginTabs({ active, scope, counts, tKeys }: RegearOriginTabsProps) {
  const origins: Array<{ value: RegearOrigin; label: string; count: number }> = [
    { value: 'auto', label: tKeys.auto, count: counts.auto },
    { value: 'manual', label: tKeys.manual, count: counts.manual },
    { value: 'all', label: tKeys.all, count: counts.all },
  ]
  return (
    <nav className="flex items-center gap-2">
      {origins.map(({ value, label, count }) => {
        const isActive = active === value
        const params = new URLSearchParams()
        if (value !== 'auto') params.set('origin', value)
        if (scope === 'all') params.set('scope', 'all')
        const qs = params.toString()
        const href = qs ? `/demo/regear?${qs}` : '/demo/regear'
        return (
          <Link
            key={value}
            href={href}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
              isActive
                ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <span>{label}</span>
            <span
              className={`text-[10px] font-semibold rounded px-1.5 py-px ${
                isActive ? 'bg-sky-500/30 text-sky-200' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {count}
            </span>
          </Link>
        )
      })}
    </nav>
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

async function ExchangeSection({ scope }: { scope: Scope }) {
  const t = await getTranslations('adminExchangeReview')
  const filtered = scope === 'pending'
    ? DEMO_EXCHANGE_REQUESTS.filter((r) => r.status === 'pending')
    : DEMO_EXCHANGE_REQUESTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=exchange"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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

async function DonationSection({ scope }: { scope: Scope }) {
  const t = await getTranslations('adminDonationReview')
  const filtered = scope === 'pending'
    ? DEMO_DONATION_REQUESTS.filter((r) => r.status === 'pending')
    : DEMO_DONATION_REQUESTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=donation"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="emerald"
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

async function ShopSection({ scope }: { scope: Scope }) {
  const t = await getTranslations('adminShopReview')
  const filtered = scope === 'pending'
    ? DEMO_SHOP_ORDERS.filter((o) => o.status === 'pending')
    : DEMO_SHOP_ORDERS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=shop"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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

async function EventPayoutSection({ scope }: { scope: Scope }) {
  const t = await getTranslations('adminEventPayoutReview')
  const filtered = scope === 'pending'
    ? DEMO_EVENT_PAYOUTS.filter((e) => e.status === 'pending')
    : DEMO_EVENT_PAYOUTS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=event_payout"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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

async function CraftSection({ scope }: { scope: Scope }) {
  const t = await getTranslations('adminCraftOrderReview')
  const filtered = scope === 'pending'
    ? DEMO_CRAFT_ORDERS.filter((c) => c.status === 'pending')
    : DEMO_CRAFT_ORDERS

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/demo/regear?tab=craft"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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
