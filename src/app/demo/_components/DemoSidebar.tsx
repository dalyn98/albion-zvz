'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  CalendarDays,
  ShieldCheck,
  Wallet,
  Users,
  Menu,
  X,
  ChevronDown,
  Settings,
  Box,
  ShoppingBag,
  Swords,
  Trophy,
  Hammer,
  ClipboardList,
  Lock,
  ExternalLink,
} from 'lucide-react'

type SectionKey = 'activity' | 'regear' | 'community' | 'profile'

interface DemoNavItem {
  href: string
  labelKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  section: SectionKey
  active: boolean
  exact?: boolean
}

// 데모는 멤버 시점만 노출 — events/regear/members 가 진짜 시드 기반.
// 나머지는 "잠금" 으로 표시해 실제 앱 범위는 보여주되 클릭은 막는다.
const DEMO_NAV: DemoNavItem[] = [
  { href: '/demo', labelKey: 'events', icon: CalendarDays, section: 'activity', active: true, exact: true },
  { href: '/demo/battles', labelKey: 'battles', icon: Swords, section: 'activity', active: false },

  { href: '/demo/regear', labelKey: 'regearRequest', icon: ShieldCheck, section: 'regear', active: true },
  { href: '/demo/craft/queue', labelKey: 'craftQueue', icon: Hammer, section: 'regear', active: false },
  { href: '/demo/craft/my-tasks', labelKey: 'craftMyTasks', icon: Box, section: 'regear', active: false },
  { href: '/demo/craft/orders', labelKey: 'craftOrders', icon: ClipboardList, section: 'regear', active: false },

  { href: '/demo/shop', labelKey: 'shop', icon: ShoppingBag, section: 'community', active: false },
  { href: '/demo/members', labelKey: 'members', icon: Users, section: 'community', active: true },
  { href: '/demo/leaderboard', labelKey: 'leaderboard', icon: Trophy, section: 'community', active: false },

  { href: '/demo/me', labelKey: 'myWallet', icon: Wallet, section: 'profile', active: false, exact: true },
  { href: '/demo/me/settings', labelKey: 'mySettings', icon: Settings, section: 'profile', active: false },
]

function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function DemoSidebar({ brandName }: { brandName: string }) {
  const pathname = usePathname() || '/demo'
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  const tSection = useTranslations('nav.section')
  const tDemo = useTranslations('demo')

  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(() => new Set())

  useEffect(() => {
    setMobileDrawer(false)
  }, [pathname])

  const toggleSection = (key: SectionKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      <div className="lg:hidden flex items-center justify-between border-b border-white/5 px-4 py-3 bg-[#0b0d12]/90 backdrop-blur-md sticky top-9 z-30">
        <button
          type="button"
          onClick={() => setMobileDrawer(true)}
          aria-label={t('openMenu')}
          className="p-1.5 text-gray-300 hover:text-white"
        >
          <Menu size={20} />
        </button>
        <Link href="/demo" className="text-amber-400 text-base font-bold">
          ⚔ {brandName}
        </Link>
        <a
          href="/api/auth/discord/start?returnTo=/"
          className="inline-flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-2.5 py-1 rounded-lg"
        >
          <ExternalLink size={12} />
          <span>Discord</span>
        </a>
      </div>

      {mobileDrawer && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileDrawer(false)}
        />
      )}

      <aside
        className={`${
          mobileDrawer ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-dvh lg:h-[calc(100vh-2.25rem)] flex-shrink-0 w-64 lg:top-9 border-r border-white/5 bg-[#0a0c11]/95 backdrop-blur-xl transition-transform duration-200 ease-out flex flex-col overflow-hidden`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 flex-shrink-0">
          <Link href="/demo" className="text-amber-400 font-bold text-[15px] tracking-tight flex items-center gap-2 truncate">
            ⚔ <span>{brandName}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileDrawer(false)}
            aria-label={t('close')}
            className="lg:hidden text-gray-400 hover:text-white p-1.5"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <DemoNavGroup
            title={t('memberGroup')}
            items={DEMO_NAV}
            pathname={pathname}
            collapsed={collapsed}
            onToggleSection={toggleSection}
            sectionLabel={(k) => tSection(k)}
            navLabel={(k) => tNav(k)}
            inactiveTooltip={tDemo('sidebar.inactiveTooltip')}
          />
        </nav>

        <div className="border-t border-white/5 flex-shrink-0 px-3 py-3 space-y-2">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <ExternalLink size={13} />
            <span>{tDemo('cta.inviteBot')}</span>
          </a>
          <p className="text-[10px] text-gray-500 leading-relaxed text-center">
            {tDemo('sidebar.footer')}
          </p>
        </div>
      </aside>
    </>
  )
}

interface SectionBucket {
  section: SectionKey
  items: DemoNavItem[]
}

function bucketBySection(items: DemoNavItem[]): SectionBucket[] {
  const buckets: SectionBucket[] = []
  for (const item of items) {
    const last = buckets[buckets.length - 1]
    if (last && last.section === item.section) {
      last.items.push(item)
    } else {
      buckets.push({ section: item.section, items: [item] })
    }
  }
  return buckets
}

function DemoNavGroup({
  title,
  items,
  pathname,
  collapsed,
  onToggleSection,
  sectionLabel,
  navLabel,
  inactiveTooltip,
}: {
  title: string
  items: DemoNavItem[]
  pathname: string
  collapsed: Set<SectionKey>
  onToggleSection: (key: SectionKey) => void
  sectionLabel: (key: SectionKey) => string
  navLabel: (key: string) => string
  inactiveTooltip: string
}) {
  const buckets = bucketBySection(items)
  return (
    <div className="px-2 space-y-1">
      <div className="px-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        {title}
      </div>
      {buckets.map((bucket) => {
        const sectionCollapsed = collapsed.has(bucket.section)
        return (
          <Fragment key={bucket.section}>
            <button
              type="button"
              onClick={() => onToggleSection(bucket.section)}
              className="w-full flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-300 hover:text-white tracking-wide transition-colors"
            >
              <span>{sectionLabel(bucket.section)}</span>
              <ChevronDown
                size={12}
                className={`transition-transform text-gray-500 ${sectionCollapsed ? '-rotate-90' : ''}`}
              />
            </button>
            {!sectionCollapsed &&
              bucket.items.map((item) => (
                <DemoNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  label={navLabel(item.labelKey)}
                  inactiveTooltip={inactiveTooltip}
                />
              ))}
          </Fragment>
        )
      })}
    </div>
  )
}

function DemoNavLink({
  item,
  pathname,
  label,
  inactiveTooltip,
}: {
  item: DemoNavItem
  pathname: string
  label: string
  inactiveTooltip: string
}) {
  const Icon = item.icon
  const active = item.active && isActivePath(pathname, item.href, item.exact)

  if (!item.active) {
    return (
      <span
        title={inactiveTooltip}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
      >
        <Icon size={15} className="flex-shrink-0" />
        <span className="truncate flex-1">{label}</span>
        <Lock size={11} className="flex-shrink-0 opacity-60" />
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-amber-500/20 text-amber-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      <Icon size={15} className="flex-shrink-0" />
      <span className="truncate flex-1">{label}</span>
    </Link>
  )
}
