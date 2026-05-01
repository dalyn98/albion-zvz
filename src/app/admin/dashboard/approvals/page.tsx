import Link from 'next/link'
import { ShieldCheck, Wallet, Gift, ShoppingBag, Coins } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  listRegearRequests,
  listExchangeRequests,
  getRegearPayoutRatePercent,
  getRegearAnomalyMap,
  getRegearOriginCounts,
  type RegearOrigin,
  type RegearOriginCounts,
} from '@/app/actions/regear-admin'
import { checkBuildSnapshotStockBatch } from '@/lib/inventory'
import type { BuildSnapshot } from '@/types'
import { listDonationRequests } from '@/app/actions/donation-admin'
import { listShopOrders } from '@/app/actions/shop-admin'
import { listEventPayoutRequests } from '@/app/actions/event-payout-admin'
import RegearReviewList from '@/components/RegearReviewList'
import ExchangeReviewList from '@/components/ExchangeReviewList'
import DonationReviewList from '@/components/DonationReviewList'
import ShopOrderReviewList from '@/components/ShopOrderReviewList'
import EventPayoutReviewList from '@/components/EventPayoutReviewList'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

type TypeKey = 'regear' | 'exchange' | 'donation' | 'shop' | 'event_payout'
type Scope = 'pending' | 'all'

interface SearchParams {
  tab?: string
  scope?: string
  origin?: string
}

function resolveType(v: string | undefined): TypeKey {
  if (v === 'exchange' || v === 'donation' || v === 'shop' || v === 'event_payout') return v
  return 'regear'
}

function resolveScope(v: string | undefined): Scope {
  return v === 'all' ? 'all' : 'pending'
}

function resolveOrigin(v: string | undefined): RegearOrigin {
  if (v === 'manual' || v === 'all') return v
  return 'auto'
}

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const type = resolveType(sp.tab)
  const scope = resolveScope(sp.scope)
  const origin = resolveOrigin(sp.origin)

  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  const guildId = await getSessionGuildId(session)
  const [tApprovals, badges] = await Promise.all([
    getTranslations('adminApprovals'),
    getAdminBadgeCounts(guildId),
  ])

  const tabs: TabDef[] = [
    { key: 'regear', label: tApprovals('tabRegear'), icon: ShieldCheck, badge: badges.regear },
    { key: 'exchange', label: tApprovals('tabExchange'), icon: Wallet, badge: badges.exchange },
    { key: 'donation', label: tApprovals('tabDonation'), icon: Gift, badge: badges.donation },
    { key: 'shop', label: tApprovals('tabShop'), icon: ShoppingBag, badge: badges.shop },
    { key: 'event_payout', label: tApprovals('tabEventPayout'), icon: Coins, badge: badges.eventPayout },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{tApprovals('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{tApprovals('pageDescription')}</p>
      </div>

      <TypeTabs active={type} tabs={tabs} tabsLabel={tApprovals('tabsLabel')} />

      {type === 'regear' && <RegearSection scope={scope} origin={origin} guildId={guildId} />}
      {type === 'exchange' && <ExchangeSection scope={scope} guildId={guildId} />}
      {type === 'donation' && <DonationSection scope={scope} guildId={guildId} />}
      {type === 'shop' && <ShopSection scope={scope} guildId={guildId} />}
      {type === 'event_payout' && <EventPayoutSection scope={scope} guildId={guildId} />}
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
}

function TypeTabs({ active, tabs, tabsLabel }: TypeTabsProps) {
  return (
    <nav
      role="tablist"
      aria-label={tabsLabel}
      className="flex gap-1 border-b border-gray-800 overflow-x-auto"
    >
      {tabs.map(({ key, label, icon: Icon, badge }) => {
        const isActive = active === key
        const hasBadge = badge > 0
        // Switching sections resets scope back to pending — the two params are
        // conceptually independent but operators almost always want to see the
        // pending queue first when they change type.
        const href = key === 'regear' ? '/admin/dashboard/approvals' : `/admin/dashboard/approvals?tab=${key}`
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
  tKeys: {
    pending: string
    all: string
  }
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
              isActive
                ? activeClass
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

async function RegearSection({
  scope,
  origin,
  guildId,
}: {
  scope: Scope
  origin: RegearOrigin
  guildId: string
}) {
  const [{ requests, error }, t, ratePercent, { counts }] = await Promise.all([
    listRegearRequests(scope, origin),
    getTranslations('adminRegearReview'),
    getRegearPayoutRatePercent(),
    getRegearOriginCounts(scope),
  ])
  // pending+crafted+build_snapshot 만 재고 체크 대상. 한 번의 묶인 쿼리로 N+1 회피.
  const stockEntries: Array<{ regearId: string; snapshot: BuildSnapshot }> = requests
    .filter((r) => r.status === 'pending' && r.fulfillment_mode === 'crafted' && r.build_snapshot)
    .map((r) => ({ regearId: r.id, snapshot: r.build_snapshot as BuildSnapshot }))
  const [avatarMap, anomalies, stockChecks] = await Promise.all([
    getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id)),
    getRegearAnomalyMap(requests),
    stockEntries.length > 0
      ? checkBuildSnapshotStockBatch(guildId, stockEntries)
      : Promise.resolve({}),
  ])
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
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
      <ScopeTabs
        baseHref={originBaseHref(origin)}
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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
          groupByEvent
          sortRowsByMember={origin === 'auto'}
          anomalies={anomalies}
          stockChecks={stockChecks}
        />
      )}
    </div>
  )
}

function originBaseHref(origin: RegearOrigin): string {
  // origin=auto 가 기본값이라 URL 에 명시 X — 다른 값일 때만 쿼리 추가.
  return origin === 'auto'
    ? '/admin/dashboard/approvals'
    : `/admin/dashboard/approvals?origin=${origin}`
}

interface RegearOriginTabsProps {
  active: RegearOrigin
  scope: Scope
  counts: RegearOriginCounts
  tKeys: {
    auto: string
    manual: string
    all: string
  }
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
        const href = qs ? `/admin/dashboard/approvals?${qs}` : '/admin/dashboard/approvals'
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
                isActive
                  ? 'bg-sky-500/30 text-sky-200'
                  : 'bg-gray-800 text-gray-300'
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

async function ExchangeSection({ scope, guildId }: { scope: Scope; guildId: string }) {
  const [{ requests, error }, t] = await Promise.all([
    listExchangeRequests(scope),
    getTranslations('adminExchangeReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=exchange"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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
        <ExchangeReviewList requests={requests} avatars={avatars} />
      )}
    </div>
  )
}

async function ShopSection({ scope, guildId }: { scope: Scope; guildId: string }) {
  const [{ orders, error }, t] = await Promise.all([
    listShopOrders(scope),
    getTranslations('adminShopReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, orders.map((o) => o.discordId))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=shop"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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
        <ShopOrderReviewList orders={orders} avatars={avatars} />
      )}
    </div>
  )
}

async function EventPayoutSection({ scope, guildId }: { scope: Scope; guildId: string }) {
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
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="amber"
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

async function DonationSection({ scope, guildId }: { scope: Scope; guildId: string }) {
  const [{ requests, error }, t] = await Promise.all([
    listDonationRequests(scope),
    getTranslations('adminDonationReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(guildId, requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals?tab=donation"
        active={scope}
        tKeys={{ pending: t('scopePending'), all: t('scopeAll') }}
        accent="emerald"
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
        <DonationReviewList requests={requests} avatars={avatars} />
      )}
    </div>
  )
}
