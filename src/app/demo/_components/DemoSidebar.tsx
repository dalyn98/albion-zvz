'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  CalendarDays,
  ShieldCheck,
  Wallet,
  LogIn,
  LogOut,
  UserCircle2,
  Users,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  ChevronDown,
  Settings,
  Box,
  Boxes,
  ShoppingBag,
  BarChart3,
  BookOpen,
  Swords,
  Trophy,
  Hammer,
  Sparkles,
  Home,
  ClipboardList,
  Archive,
  ScrollText,
} from 'lucide-react'
import { DEMO_ADMIN_BADGES } from '@/data/demo-seed'

// AppSidebar 의 sub-section 과 동일한 키 — i18n 은 `nav.section.*` 에서 그대로 가져온다.
type SectionKey =
  | 'activity'
  | 'regear'
  | 'community'
  | 'profile'
  | 'ops'
  | 'features'
  | 'system'

interface NavItem {
  href: string
  labelKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  exact?: boolean
  section: SectionKey
  // 관리자 nav 의 빨간 배지 (어드민 승인 큐).
  adminBadge?: number
}

// 멤버 nav — 어드민도 "멤버 시점 + 어드민 시점" 둘 다 보이게 노출. 실제 AppSidebar 와 동일 순서.
const MEMBER_NAV: NavItem[] = [
  { href: '/demo', labelKey: 'publicProfile', icon: Home, exact: true, section: 'activity' },
  { href: '/demo/events', labelKey: 'events', icon: CalendarDays, section: 'activity' },
  { href: '/demo/battles', labelKey: 'battles', icon: Swords, section: 'activity' },
  { href: '/demo/regear', labelKey: 'regearRequest', icon: ShieldCheck, section: 'regear' },
  { href: '/demo/craft/queue', labelKey: 'craftQueue', icon: Hammer, section: 'regear' },
  { href: '/demo/craft/my-tasks', labelKey: 'craftMyTasks', icon: Box, section: 'regear' },
  { href: '/demo/craft/orders', labelKey: 'craftOrders', icon: ClipboardList, section: 'regear' },
  { href: '/demo/shop', labelKey: 'shop', icon: ShoppingBag, section: 'community' },
  { href: '/demo/members', labelKey: 'members', icon: Users, section: 'community' },
  { href: '/demo/leaderboard', labelKey: 'leaderboard', icon: Trophy, section: 'community' },
  { href: '/demo/me', labelKey: 'myWallet', icon: Wallet, exact: true, section: 'profile' },
  { href: '/demo/me/settings', labelKey: 'mySettings', icon: Settings, section: 'profile' },
]

const ADMIN_NAV: NavItem[] = [
  // 운영
  { href: '/demo/events', labelKey: 'eventAdmin', icon: CalendarDays, exact: true, section: 'ops' },
  {
    href: '/demo/regear',
    labelKey: 'approvals',
    icon: ShieldCheck,
    section: 'ops',
    adminBadge:
      DEMO_ADMIN_BADGES.regear +
      DEMO_ADMIN_BADGES.exchange +
      DEMO_ADMIN_BADGES.donation +
      DEMO_ADMIN_BADGES.shop +
      DEMO_ADMIN_BADGES.eventPayout,
  },
  // 기능
  { href: '/demo/shop', labelKey: 'shopAdmin', icon: ShoppingBag, section: 'features' },
  { href: '/demo/craft', labelKey: 'craftAdmin', icon: Hammer, section: 'features' },
  { href: '/demo/inventory', labelKey: 'inventoryAdmin', icon: Boxes, section: 'features' },
  { href: '/demo/guild-profile', labelKey: 'guildProfile', icon: Sparkles, section: 'features' },
  // 시스템
  { href: '/demo/stats', labelKey: 'stats', icon: BarChart3, section: 'system' },
  { href: '/demo/audit', labelKey: 'audit', icon: ScrollText, section: 'system' },
  { href: '/demo/settings', labelKey: 'settings', icon: Settings, section: 'system' },
  { href: '/demo/backup', labelKey: 'backup', icon: Archive, section: 'system' },
]

const STORAGE_KEY = 'demo.sidebar.open'
const MEMBER_GROUP_KEY = 'demo.sidebar.memberOpen.v2'
const ADMIN_GROUP_KEY = 'demo.sidebar.adminOpen.v2'
const SECTION_COLLAPSED_KEY = 'demo.sidebar.sectionCollapsed.v2'
const DEFAULT_COLLAPSED_SECTIONS: SectionKey[] = ['regear', 'community', 'profile', 'features', 'system']

function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface DemoSidebarProps {
  brandName: string
}

export default function DemoSidebar({ brandName }: DemoSidebarProps) {
  const pathname = usePathname() || '/demo'
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  const tSection = useTranslations('nav.section')

  const [open, setOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(
    () => new Set(DEFAULT_COLLAPSED_SECTIONS),
  )

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const memberStored = window.localStorage.getItem(MEMBER_GROUP_KEY)
    const adminStored = window.localStorage.getItem(ADMIN_GROUP_KEY)
    const sectionStored = window.localStorage.getItem(SECTION_COLLAPSED_KEY)
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches
    // mount-only localStorage hydration. SSR 단계에선 알 수 없는 클라이언트 prefs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(stored === null ? wideScreen : stored === 'true')
    const onAdminLikeRoute = ['/demo/stats', '/demo/audit', '/demo/settings', '/demo/backup'].some(
      (href) => window.location.pathname.startsWith(href),
    )
    if (memberStored !== null) setMemberOpen(memberStored === 'true')
    else setMemberOpen(!onAdminLikeRoute)
    if (adminStored !== null) setAdminOpen(adminStored === 'true')
    else setAdminOpen(onAdminLikeRoute)
    if (sectionStored !== null) {
      try {
        const parsed = JSON.parse(sectionStored)
        if (Array.isArray(parsed)) {
          setCollapsedSections(new Set(parsed.filter((k): k is SectionKey => typeof k === 'string')))
        }
      } catch (e) {
        console.error('[DemoSidebar] failed to parse collapsed-sections localStorage value:', e)
      }
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, String(open))
  }, [open, hydrated])
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(MEMBER_GROUP_KEY, String(memberOpen))
  }, [memberOpen, hydrated])
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(ADMIN_GROUP_KEY, String(adminOpen))
  }, [adminOpen, hydrated])
  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(SECTION_COLLAPSED_KEY, JSON.stringify([...collapsedSections]))
    }
  }, [collapsedSections, hydrated])

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    // 라우트 전환 시 mobile drawer 자동 닫기 — 외부 (라우터) 상태 → 로컬 state 동기화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDrawer(false)
  }, [pathname])

  const navExpanded = mobileDrawer || open

  // 데모는 Eternia 를 모의 어드민 세션으로 보여준다 — 실제 로그인 X.
  // 로그인 버튼은 진짜 Discord OAuth 로 연결해 방문자가 그대로 가입할 수 있게.
  const loginHref = '/api/auth/discord/start?returnTo=/'

  return (
    <>
      {/* Mobile top bar */}
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
        <Link href="/demo/me/profile" aria-label={t('myInfo')} className="flex items-center">
          <UserCircle2 size={24} className="text-gray-400" />
        </Link>
      </div>

      {/* Mobile drawer overlay */}
      {mobileDrawer && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileDrawer(false)}
        />
      )}

      <aside
        className={`${
          mobileDrawer ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-dvh lg:h-[calc(100vh-2.25rem)] flex-shrink-0 lg:top-9 border-r border-white/5 bg-[#0a0c11]/95 backdrop-blur-xl transition-[transform,width] duration-200 ease-out ${
          navExpanded ? 'w-64' : 'w-[64px]'
        } lg:w-auto ${open ? 'lg:w-64' : 'lg:w-[64px]'} flex flex-col overflow-hidden`}
      >
        {/* Brand + collapse toggle */}
        <div
          className={`flex items-center ${
            navExpanded ? 'justify-between px-4' : 'justify-center'
          } h-14 border-b border-white/5 flex-shrink-0`}
        >
          {navExpanded && (
            <Link
              href="/demo"
              className="text-amber-400 font-bold text-[15px] tracking-tight flex items-center gap-2 truncate"
            >
              ⚔ <span>{brandName}</span>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileDrawer(false)}
              aria-label={t('close')}
              className="lg:hidden text-gray-400 hover:text-white p-1.5"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t('collapse') : t('expand')}
              className="hidden lg:inline text-gray-400 hover:text-white p-1.5"
            >
              {open ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          <NavGroup
            title={t('memberGroup')}
            items={MEMBER_NAV.map((i) => ({ ...i, label: tNav(i.labelKey) }))}
            pathname={pathname}
            expanded={navExpanded}
            collapsible={memberOpen}
            setCollapsible={setMemberOpen}
            sectionLabel={(key) => tSection(key)}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
          />
          <NavGroup
            title={t('adminGroup')}
            items={ADMIN_NAV.map((i) => ({
              ...i,
              label: tNav(i.labelKey),
              badge: i.adminBadge,
            }))}
            pathname={pathname}
            expanded={navExpanded}
            collapsible={adminOpen}
            setCollapsible={setAdminOpen}
            sectionLabel={(key) => tSection(key)}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
          />
        </nav>

        {/* Admin guide link footer */}
        <div
          className={`border-t border-white/5 flex-shrink-0 ${
            navExpanded ? 'px-3 pt-2 pb-1' : 'px-2 pt-2 pb-1'
          }`}
        >
          <Link
            href="/demo/guide"
            title={navExpanded ? undefined : tNav('guide')}
            className={`flex items-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors ${
              navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
            }`}
          >
            <BookOpen size={navExpanded ? 13 : 16} className="flex-shrink-0" />
            {navExpanded && <span className="truncate">{tNav('guide')}</span>}
          </Link>
        </div>

        {/* Footer — mock session (Eternia as admin) */}
        <div
          className={`border-t border-white/5 flex-shrink-0 ${
            navExpanded ? 'px-3 py-3' : 'px-2 py-3'
          }`}
        >
          <div
            className={`flex ${
              navExpanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'
            }`}
          >
            <Link
              href="/demo/me/profile"
              className={`flex items-center gap-2 min-w-0 flex-1 hover:text-white ${
                navExpanded ? '' : 'justify-center'
              }`}
              aria-label={t('myInfo')}
              title={t('myInfo')}
            >
              <UserCircle2 size={24} className="text-gray-400 flex-shrink-0" />
              {navExpanded && (
                <span className="text-gray-200 text-xs font-medium truncate">Eternia</span>
              )}
            </Link>
            <a
              href={loginHref}
              className="flex items-center gap-1 text-gray-500 hover:text-amber-300 p-1.5"
              aria-label={t('login')}
              title={t('login')}
            >
              <LogIn size={14} />
            </a>
          </div>
          {navExpanded && (
            <a
              href={loginHref}
              className="mt-2 flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <LogOut size={11} />
              <span>{t('logout')}</span>
            </a>
          )}
        </div>
      </aside>
    </>
  )
}

interface ResolvedNavItem extends NavItem {
  label: string
  badge?: number
}

interface NavGroupProps {
  title: string
  items: ResolvedNavItem[]
  pathname: string
  expanded: boolean
  collapsible: boolean
  setCollapsible: (next: boolean) => void
  sectionLabel: (key: SectionKey) => string
  collapsedSections: Set<SectionKey>
  onToggleSection: (key: SectionKey) => void
}

interface SectionBucket {
  section: SectionKey
  items: ResolvedNavItem[]
}

function bucketBySection(items: ResolvedNavItem[]): SectionBucket[] {
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

function NavLink({
  item,
  pathname,
  expanded,
}: {
  item: ResolvedNavItem
  pathname: string
  expanded: boolean
}) {
  const { href, label, icon: Icon, exact, badge } = item
  const active = isActivePath(pathname, href, exact)
  const hasBadge = typeof badge === 'number' && badge > 0
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      className={`relative flex items-center gap-3 rounded-lg transition-colors ${
        expanded ? 'px-3 py-2 text-sm' : 'justify-center p-2'
      } ${
        active
          ? 'bg-amber-500/20 text-amber-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      <span className="relative flex-shrink-0">
        <Icon size={expanded ? 15 : 18} />
        {hasBadge && !expanded && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {expanded && <span className="truncate flex-1">{label}</span>}
      {hasBadge && expanded && (
        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none flex items-center justify-center flex-shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

function NavGroup({
  title,
  items,
  pathname,
  expanded,
  collapsible,
  setCollapsible,
  sectionLabel,
  collapsedSections,
  onToggleSection,
}: NavGroupProps) {
  const buckets = bucketBySection(items)
  const showSubHeaders = expanded && buckets.length > 1
  const groupHasActive = items.some((item) => isActivePath(pathname, item.href, item.exact))
  const groupOpen = collapsible || !expanded || groupHasActive
  return (
    <div className="px-2 space-y-1">
      {expanded ? (
        <button
          type="button"
          onClick={() => setCollapsible(!collapsible)}
          className="w-full flex items-center justify-between px-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300"
        >
          <span>{title}</span>
          <ChevronDown
            size={12}
            className={`transition-transform ${groupOpen ? '' : '-rotate-90'}`}
          />
        </button>
      ) : (
        <div className="border-t border-gray-800 mx-2 my-1" aria-label={title} />
      )}
      {groupOpen &&
        (showSubHeaders
          ? buckets.map((bucket) => {
              const sectionHasActive = bucket.items.some((item) =>
                isActivePath(pathname, item.href, item.exact),
              )
              const sectionCollapsed = collapsedSections.has(bucket.section) && !sectionHasActive
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
                      className={`transition-transform text-gray-500 ${
                        sectionCollapsed ? '-rotate-90' : ''
                      }`}
                    />
                  </button>
                  {!sectionCollapsed &&
                    bucket.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        expanded={expanded}
                      />
                    ))}
                </Fragment>
              )
            })
          : items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
            )))}
    </div>
  )
}
