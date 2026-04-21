import Link from 'next/link'
import { ShieldCheck, Wallet, Gift } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { listRegearRequests, listExchangeRequests } from '@/app/actions/regear-admin'
import { listDonationRequests } from '@/app/actions/donation-admin'
import RegearReviewList from '@/components/RegearReviewList'
import ExchangeReviewList from '@/components/ExchangeReviewList'
import DonationReviewList from '@/components/DonationReviewList'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { getAdminBadgeCounts } from '@/lib/admin-badges'

type TypeKey = 'regear' | 'exchange' | 'donation'
type Scope = 'pending' | 'all'

interface SearchParams {
  tab?: string
  scope?: string
}

function resolveType(v: string | undefined): TypeKey {
  return v === 'exchange' || v === 'donation' ? v : 'regear'
}

function resolveScope(v: string | undefined): Scope {
  return v === 'all' ? 'all' : 'pending'
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

  const [tApprovals, badges] = await Promise.all([
    getTranslations('adminApprovals'),
    getAdminBadgeCounts(),
  ])

  const tabs: TabDef[] = [
    { key: 'regear', label: tApprovals('tabRegear'), icon: ShieldCheck, badge: badges.regear },
    { key: 'exchange', label: tApprovals('tabExchange'), icon: Wallet, badge: badges.exchange },
    { key: 'donation', label: tApprovals('tabDonation'), icon: Gift, badge: badges.donation },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{tApprovals('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{tApprovals('pageDescription')}</p>
      </div>

      <TypeTabs active={type} tabs={tabs} tabsLabel={tApprovals('tabsLabel')} />

      {type === 'regear' && <RegearSection scope={scope} />}
      {type === 'exchange' && <ExchangeSection scope={scope} />}
      {type === 'donation' && <DonationSection scope={scope} />}
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

async function RegearSection({ scope }: { scope: Scope }) {
  const [{ requests, error }, t] = await Promise.all([
    listRegearRequests(scope),
    getTranslations('adminRegearReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <ScopeTabs
        baseHref="/admin/dashboard/approvals"
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
        <RegearReviewList requests={requests} avatars={avatars} />
      )}
    </div>
  )
}

async function ExchangeSection({ scope }: { scope: Scope }) {
  const [{ requests, error }, t] = await Promise.all([
    listExchangeRequests(scope),
    getTranslations('adminExchangeReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(requests.map((r) => r.discord_id))
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

async function DonationSection({ scope }: { scope: Scope }) {
  const [{ requests, error }, t] = await Promise.all([
    listDonationRequests(scope),
    getTranslations('adminDonationReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(requests.map((r) => r.discord_id))
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
