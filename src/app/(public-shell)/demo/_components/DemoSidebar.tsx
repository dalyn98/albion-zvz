'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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
  KeyRound,
  ScrollText,
  Zap,
  LayoutTemplate,
} from 'lucide-react'
import { DEMO_ADMIN_BADGES } from '@/data/demo-seed'
import { resolveDemoNavigationHref } from '@/lib/demo-redirects'
import {
  APP_AREA_DESCRIPTORS,
  resolveAppArea,
  type AppArea,
} from '@/lib/app-route-registry'

// AppSidebar 의 sub-section 과 동일한 키 — i18n 은 `nav.section.*` 에서 그대로 가져온다.
type SectionKey =
  | 'activity'
  | 'regear'
  | 'community'
  | 'profile'
  | 'ops'
  | 'features'
  | 'system'
  | 'adminSupply'
  | 'adminInsight'
  | 'adminSettings'

interface NavItem {
  href: string
  labelKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  exact?: boolean
  section: SectionKey
  // 관리자 nav 의 빨간 배지 (어드민 승인 큐).
  adminBadge?: number
}

interface ResolvedNavItem extends NavItem {
  label: string
  badge?: number
}

// 멤버 nav — 어드민도 "멤버 시점 + 어드민 시점" 둘 다 보이게 노출. 실제 AppSidebar 와 동일 순서.
const MEMBER_NAV: NavItem[] = [
  { href: '/demo', labelKey: 'publicProfile', icon: Home, exact: true, section: 'activity' },
  { href: '/demo/member-events', labelKey: 'events', icon: CalendarDays, section: 'activity' },
  { href: '/demo/battles', labelKey: 'battles', icon: Swords, section: 'activity' },
  { href: '/demo/member-regear', labelKey: 'regearRequest', icon: ShieldCheck, section: 'regear' },
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
  { href: '/demo/builds', labelKey: 'buildTemplates', icon: LayoutTemplate, section: 'ops' },
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
      DEMO_ADMIN_BADGES.memberTrade +
      DEMO_ADMIN_BADGES.eventPayout +
      DEMO_ADMIN_BADGES.craft,
  },
  // 보급/재화
  { href: '/demo/shop', labelKey: 'shopAdmin', icon: ShoppingBag, section: 'adminSupply' },
  { href: '/demo/siphon', labelKey: 'siphonAdmin', icon: Zap, section: 'adminSupply' },
  { href: '/demo/loot-audit', labelKey: 'lootAudit', icon: ScrollText, section: 'adminSupply' },
  { href: '/demo/craft', labelKey: 'craftAdmin', icon: Hammer, section: 'adminSupply' },
  { href: '/demo/inventory', labelKey: 'inventoryAdmin', icon: Boxes, section: 'adminSupply' },
  // 분석/기록
  { href: '/demo/stats', labelKey: 'stats', icon: BarChart3, section: 'adminInsight' },
  { href: '/demo/audit', labelKey: 'audit', icon: ScrollText, section: 'adminInsight' },
  // 길드 설정
  { href: '/demo/guild-profile', labelKey: 'guildProfile', icon: Sparkles, section: 'adminSettings' },
  { href: '/demo/permissions', labelKey: 'permissions', icon: KeyRound, section: 'adminSettings' },
  { href: '/demo/settings', labelKey: 'settings', icon: Settings, section: 'adminSettings' },
  { href: '/demo/backup', labelKey: 'backup', icon: Archive, section: 'adminSettings' },
]

const STORAGE_KEY = 'demo.sidebar.open'
const MEMBER_GROUP_KEY = 'demo.sidebar.memberOpen.v2'
const ADMIN_GROUP_KEY = 'demo.sidebar.adminOpen.v2'
const SECTION_COLLAPSED_KEY = 'demo.sidebar.sectionCollapsed.v3'
const DEFAULT_COLLAPSED_SECTIONS: SectionKey[] = [
  'regear',
  'community',
  'profile',
  'features',
  'system',
  'adminSupply',
  'adminInsight',
  'adminSettings',
]

const DEMO_PROFILE_HREF = resolveDemoNavigationHref('/demo/me/profile') ?? '/demo'

const DEMO_AREA_ICONS: Record<
  AppArea,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  today: Home,
  operations: Swords,
  supply: Boxes,
  records: ScrollText,
  guild: Users,
}

function isActivePath(currentHref: string, href: string, exact = false): boolean {
  const [currentPathname, currentSearch = ''] = currentHref.split('?')
  const [hrefPathname, hrefSearch = ''] = href.split('?')

  if (hrefSearch) return currentPathname === hrefPathname && currentSearch === hrefSearch
  if (exact) return currentHref === href
  return currentPathname === hrefPathname || currentPathname.startsWith(`${hrefPathname}/`)
}

function resolveNavItems(
  items: NavItem[],
  labelFor: (key: string) => string,
): ResolvedNavItem[] {
  const seenHrefs = new Set<string>()
  const resolvedItems: ResolvedNavItem[] = []

  for (const item of items) {
    const href = resolveDemoNavigationHref(item.href)
    if (!href || seenHrefs.has(href)) continue

    seenHrefs.add(href)
    resolvedItems.push({
      ...item,
      href,
      label: labelFor(item.labelKey),
      exact: item.exact || href === '/demo' || href.includes('?'),
      badge: item.adminBadge,
    })
  }

  return resolvedItems
}

interface DemoSidebarProps {
  brandName: string
}

export default function DemoSidebar({ brandName }: DemoSidebarProps) {
  const pathname = usePathname() || '/demo'
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const currentHref = search ? `${pathname}?${search}` : pathname
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  const tSection = useTranslations('nav.section')

  const [open, setOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)
  const shouldRestoreMobileMenuFocus = useRef(false)
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
    const onAdminLikeRoute = ['/demo/builds', '/demo/stats', '/demo/audit', '/demo/settings', '/demo/backup'].some(
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
    shouldRestoreMobileMenuFocus.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDrawer(false)
  }, [currentHref])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return
      shouldRestoreMobileMenuFocus.current = false
      setMobileDrawer(false)
    }
    desktopQuery.addEventListener('change', closeDrawerOnDesktop)
    return () => desktopQuery.removeEventListener('change', closeDrawerOnDesktop)
  }, [])

  useEffect(() => {
    if (!mobileDrawer) return
    const drawer = mobileDrawerRef.current
    const menuTrigger = mobileMoreTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusTimer = window.setTimeout(() => {
      drawer
        ?.querySelector<HTMLElement>('[data-mobile-drawer-close]')
        ?.focus({ preventScroll: true })
    }, 100)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        shouldRestoreMobileMenuFocus.current = true
        setMobileDrawer(false)
        return
      }
      if (event.key !== 'Tab' || !drawer) return
      const focusable = drawer.querySelectorAll<HTMLElement>(focusableSelector)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (shouldRestoreMobileMenuFocus.current) {
        queueMicrotask(() => menuTrigger?.focus())
      }
    }
  }, [mobileDrawer])

  const navExpanded = mobileDrawer || open
  const memberItems = resolveNavItems(MEMBER_NAV, tNav)
  const adminItems = resolveNavItems(ADMIN_NAV, tNav)
  const activeArea = resolveAppArea(currentHref) ?? 'today'
  const areaItems = APP_AREA_DESCRIPTORS.map((item) => ({
    ...item,
    href: resolveDemoNavigationHref(item.demoHref) ?? item.demoHref,
  }))
  const memberTools = memberItems.filter((item) => resolveAppArea(item.href) === activeArea)
  const adminTools = adminItems.filter((item) => resolveAppArea(item.href) === activeArea)

  // 데모는 Eternia 를 모의 어드민 세션으로 보여준다 — 실제 로그인 X.
  // 로그인 버튼은 진짜 Discord OAuth 로 연결해 방문자가 그대로 가입할 수 있게.
  const loginHref = '/api/auth/discord/start?returnTo=/'

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between border-b border-white/5 px-4 py-3 bg-[#0b0d12]/90 backdrop-blur-md sticky top-10 z-30">
        <button
          ref={mobileMoreTriggerRef}
          type="button"
          onClick={() => {
            shouldRestoreMobileMenuFocus.current = true
            setMobileDrawer(true)
          }}
          aria-label={t('openMenu')}
          aria-expanded={mobileDrawer}
          aria-controls="demo-sidebar-navigation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Menu size={20} />
        </button>
        <Link href="/demo" className="text-amber-400 text-base font-bold">
          ⚔ {brandName}
        </Link>
        <Link
          href={DEMO_PROFILE_HREF}
          aria-label={t('myInfo')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-white/5"
        >
          <UserCircle2 size={24} className="text-gray-400" />
        </Link>
      </div>

      {/* Mobile drawer overlay */}
      {mobileDrawer && (
        <div
          className="fixed inset-0 z-[55] bg-black/70 lg:hidden"
          onClick={() => {
            shouldRestoreMobileMenuFocus.current = true
            setMobileDrawer(false)
          }}
          aria-hidden="true"
        />
      )}

      <aside
        ref={mobileDrawerRef}
        id="demo-sidebar-navigation"
        role={mobileDrawer ? 'dialog' : undefined}
        aria-modal={mobileDrawer ? true : undefined}
        aria-label={mobileDrawer ? t('navigation') : undefined}
        className={`${
          mobileDrawer ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-[60] lg:z-40 h-dvh lg:h-[calc(100vh-2.5rem)] flex-shrink-0 lg:top-10 border-r border-white/5 bg-[#0a0c11]/95 backdrop-blur-xl transition-[transform,width,visibility] duration-200 ease-out ${
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
              className="text-amber-400 font-bold text-[15px] flex items-center gap-2 truncate"
            >
              ⚔ <span>{brandName}</span>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                shouldRestoreMobileMenuFocus.current = true
                setMobileDrawer(false)
              }}
              aria-label={t('close')}
              data-mobile-drawer-close
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t('collapse') : t('expand')}
              aria-expanded={open}
              aria-controls="demo-sidebar-navigation"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-white lg:inline-flex"
            >
              {open ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          <div className="px-2">
            {navExpanded && (
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                {t('primaryNavigation')}
              </p>
            )}
            <div className="space-y-1">
              {areaItems.map((item) => {
                const Icon = DEMO_AREA_ICONS[item.key]
                const active = item.key === activeArea
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    title={navExpanded ? undefined : tNav(item.labelKey)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex min-h-11 items-center rounded-md border-l-2 transition-colors ${
                      navExpanded ? 'gap-3 px-3 py-2 text-sm' : 'justify-center px-2 py-2'
                    } ${
                      active
                        ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                        : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon size={navExpanded ? 16 : 19} aria-hidden="true" />
                    {navExpanded && <span className="truncate">{tNav(item.labelKey)}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="mx-4 border-t border-white/5" />
          <NavGroup
            title={t('memberGroup')}
            items={memberTools}
            currentHref={currentHref}
            expanded={navExpanded}
            collapsible={memberOpen}
            setCollapsible={setMemberOpen}
            sectionLabel={(key) => tSection(key)}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
          />
          <NavGroup
            title={t('adminGroup')}
            items={adminTools}
            currentHref={currentHref}
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
            className={`flex min-h-10 items-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors ${
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
              href={DEMO_PROFILE_HREF}
              className={`flex min-h-10 items-center gap-2 min-w-0 flex-1 rounded-md hover:text-white ${
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-800/60 hover:text-amber-300"
              aria-label={t('login')}
              title={t('login')}
            >
              <LogIn size={14} />
            </a>
          </div>
          {navExpanded && (
            <a
              href={loginHref}
              className="mt-2 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#4752c4]"
            >
              <LogOut size={11} />
              <span>{t('logout')}</span>
            </a>
          )}
        </div>
      </aside>

      <nav
        aria-label={t('primaryNavigation')}
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#080a0e]/95 px-2 pt-1 shadow-[0_-8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:hidden"
      >
        <div className="grid min-h-14 grid-cols-5">
          {areaItems.map((item) => {
            const Icon = DEMO_AREA_ICONS[item.key]
            const active = item.key === activeArea
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 transition-colors active:bg-white/5 ${
                  active ? 'text-amber-300' : 'text-gray-500'
                }`}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="max-w-full truncate text-[10px] font-medium leading-tight">
                  {tNav(item.labelKey)}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

interface NavGroupProps {
  title: string
  items: ResolvedNavItem[]
  currentHref: string
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
  currentHref,
  expanded,
}: {
  item: ResolvedNavItem
  currentHref: string
  expanded: boolean
}) {
  const { href, label, icon: Icon, exact, badge } = item
  const active = isActivePath(currentHref, href, exact)
  const hasBadge = typeof badge === 'number' && badge > 0
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      className={`relative flex min-h-10 items-center gap-3 rounded-lg transition-colors ${
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
  currentHref,
  expanded,
  collapsible,
  setCollapsible,
  sectionLabel,
  collapsedSections,
  onToggleSection,
}: NavGroupProps) {
  const buckets = bucketBySection(items)
  const showSubHeaders = expanded && buckets.length > 1
  const groupHasActive = items.some((item) => isActivePath(currentHref, item.href, item.exact))
  const groupOpen = collapsible || !expanded || groupHasActive
  return (
    <div className="px-2 space-y-1">
      {expanded ? (
        <button
          type="button"
          onClick={() => setCollapsible(!collapsible)}
          className="flex min-h-10 w-full items-center justify-between rounded-md px-2 text-[10px] font-bold uppercase text-gray-500 transition-colors hover:bg-gray-800/60 hover:text-gray-300"
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
                isActivePath(currentHref, item.href, item.exact),
              )
              const sectionCollapsed = collapsedSections.has(bucket.section) && !sectionHasActive
              return (
                <Fragment key={bucket.section}>
                  <button
                    type="button"
                    onClick={() => onToggleSection(bucket.section)}
                    className="flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-800/60 hover:text-white"
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
                        currentHref={currentHref}
                        expanded={expanded}
                      />
                    ))}
                </Fragment>
              )
            })
          : items.map((item) => (
              <NavLink key={item.href} item={item} currentHref={currentHref} expanded={expanded} />
            )))}
    </div>
  )
}
