'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
import {
  CalendarDays,
  ShieldCheck,
  LogIn,
  UserCircle2,
  Users,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  Settings,
  Box,
  Boxes,
  ShoppingBag,
  BarChart3,
  BookOpen,
  Swords,
  Hammer,
  Home,
  ScrollText,
} from 'lucide-react'
import {
  getNavigationSearchAliasKey,
  groupNavigationByArea,
} from '@/lib/app-navigation'
import { useContextualAreaNavigation } from '@/hooks/use-contextual-area-navigation'
import { resolveDemoNavigationHref } from '@/lib/demo-redirects'
import {
  resolveAppArea,
  resolveAppCurrentRouteHint,
  type AppArea,
} from '@/lib/app-route-registry'
import AreaNavigation, { type AreaNavigationItem } from '@/components/AreaNavigation'
import { useDemoSession } from './DemoSessionProvider'

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
  { href: '/demo/me', labelKey: 'myWallet', icon: Home, exact: true, section: 'activity' },
  { href: '/demo/member-events', labelKey: 'events', icon: CalendarDays, section: 'activity' },
  { href: '/demo/battles', labelKey: 'battles', icon: Swords, section: 'activity' },
  { href: '/demo/member-regear', labelKey: 'regearRequest', icon: ShieldCheck, section: 'regear' },
  { href: '/demo/craft/my-tasks', labelKey: 'craftMyTasks', icon: Box, section: 'regear' },
  { href: '/demo/shop?audience=member', labelKey: 'shop', icon: ShoppingBag, section: 'community' },
  { href: '/demo/members', labelKey: 'members', icon: Users, section: 'community' },
  { href: '/demo/me/settings', labelKey: 'mySettings', icon: Settings, section: 'profile' },
]

const ADMIN_NAV: NavItem[] = [
  // 운영
  { href: '/demo', labelKey: 'publicProfile', icon: Home, exact: true, section: 'ops' },
  { href: '/demo/events', labelKey: 'eventAdmin', icon: CalendarDays, exact: true, section: 'ops' },
  {
    href: '/demo/regear',
    labelKey: 'approvals',
    icon: ShieldCheck,
    section: 'ops',
  },
  // 보급/재화
  { href: '/demo/craft', labelKey: 'craftAdmin', icon: Hammer, section: 'adminSupply' },
  { href: '/demo/inventory', labelKey: 'inventoryAdmin', icon: Boxes, section: 'adminSupply' },
  // 분석/기록
  { href: '/demo/stats', labelKey: 'stats', icon: BarChart3, section: 'adminInsight' },
  { href: '/demo/audit', labelKey: 'audit', icon: ScrollText, section: 'adminInsight' },
  // 길드 설정
  { href: '/demo/settings', labelKey: 'settings', icon: Settings, section: 'adminSettings' },
]

const STORAGE_KEY = 'demo.sidebar.open'

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
  const tSearchAliases = useTranslations('sidebar.searchAliases')
  const { projection } = useDemoSession()

  const [open, setOpen] = useState(false)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)
  const shouldRestoreMobileMenuFocus = useRef(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches
    // mount-only localStorage hydration. SSR 단계에선 알 수 없는 클라이언트 prefs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(stored === null ? wideScreen : stored === 'true')
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, String(open))
  }, [open, hydrated])
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
    const releaseScrollLock = acquireBodyScrollLock()
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusTimer = window.setTimeout(() => {
      drawer
        ?.querySelector<HTMLElement>('[data-mobile-drawer-close]')
        ?.focus({ preventScroll: true })
    }, 100)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[data-feature-search-dialog]')) return
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
      releaseScrollLock()
      if (shouldRestoreMobileMenuFocus.current) {
        queueMicrotask(() => menuTrigger?.focus())
      }
    }
  }, [mobileDrawer])

  const navExpanded = mobileDrawer || open
  const withSearchAlias = (item: ResolvedNavItem): AreaNavigationItem => {
    const aliasKey = getNavigationSearchAliasKey(item.labelKey)
    return {
      ...item,
      aliases: aliasKey ? tSearchAliases(aliasKey) : undefined,
    }
  }
  const withJourneyBadge = (item: AreaNavigationItem): AreaNavigationItem => {
    if (item.href === '/demo/regear') return { ...item, badge: projection.approvalCount }
    if (item.href === '/demo/craft/my-tasks') return { ...item, badge: projection.craftTaskCount }
    if (item.href === '/demo/member-regear') {
      return { ...item, badge: projection.pickupCount || projection.approvalCount }
    }
    return item
  }
  const memberItems = resolveNavItems(MEMBER_NAV, tNav).map(withSearchAlias).map(withJourneyBadge)
  const adminItems = resolveNavItems(ADMIN_NAV, tNav).map(withSearchAlias).map(withJourneyBadge)
  const areaNavigationGroups = groupNavigationByArea(memberItems, adminItems).map((group) => ({
    ...group,
    label: tNav(group.area),
    icon: DEMO_AREA_ICONS[group.area],
  }))
  const resolvedCurrentArea = resolveAppArea(currentHref)
  const currentRouteHint = resolveAppCurrentRouteHint(currentHref)
  const currentContext = resolvedCurrentArea ? {
    audience: currentRouteHint.audience,
    destinationLabel: currentRouteHint.label === 'profile'
      ? t('myInfo')
      : currentRouteHint.label === 'wallet'
        ? tNav('wallet')
        : tNav(resolvedCurrentArea),
  } : undefined
  const {
    destinations: areaItems,
    activeAudience,
    recentHrefs,
  } = useContextualAreaNavigation({
    currentHref,
    groups: areaNavigationGroups,
    storageScope: 'demo',
    fallbackAudience: 'operator',
    currentContext,
  })
  const activeArea = resolvedCurrentArea ?? areaItems[0]?.area ?? 'today'

  // 데모는 Eternia 를 모의 어드민 세션으로 보여준다 — 실제 로그인 X.
  // 로그인 버튼은 진짜 Discord OAuth 로 연결해 방문자가 그대로 가입할 수 있게.
  const loginHref = '/login?returnTo=%2F'

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between border-b border-white/5 px-4 py-3 bg-[#0b0d12]/90 backdrop-blur-md sticky top-10 z-30">
        <button
          ref={mobileMoreTriggerRef}
          data-mobile-scroll-lock-trigger="demo-drawer"
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
        <Link href="/demo" className="flex min-w-0 flex-col items-center justify-center">
          <span className="truncate text-base font-bold text-amber-400">⚔ {brandName}</span>
          <span className="truncate text-[10px] font-medium text-gray-500">
            {tNav(activeArea)} · {activeAudience === 'operator' ? t('guildOperations') : t('myWork')}
          </span>
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
        data-mobile-scroll-lock-overlay={mobileDrawer ? 'demo-drawer' : undefined}
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
        <nav className="flex-1 overflow-y-auto py-3 space-y-4" aria-label={t('primaryNavigation')}>
          <AreaNavigation
            key={activeArea}
            groups={areaNavigationGroups}
            destinations={areaItems}
            recentHrefs={recentHrefs}
            activeArea={activeArea}
            currentHref={currentHref}
            expanded={navExpanded}
            variant="demo"
            labels={{
              featureSearch: t('featureSearch'),
              featureSearchPlaceholder: t('featureSearchPlaceholder'),
              featureSearchDescription: t('featureSearchDescription'),
              noSearchResults: t('noSearchResults'),
              myWork: t('myWork'),
              guildOperations: t('guildOperations'),
              currentArea: t('currentArea'),
              close: t('close'),
              expandArea: (area) => t('expandArea', { area }),
              collapseArea: (area) => t('collapseArea', { area }),
              areaDestination: (area, destination) => t('areaDestination', { area, destination }),
              moreItems: (count) => t('moreItems', { count }),
            }}
            onNavigate={() => {
              shouldRestoreMobileMenuFocus.current = false
              setMobileDrawer(false)
            }}
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
          <Link
            href={DEMO_PROFILE_HREF}
            className={`flex min-h-10 items-center gap-2 rounded-md hover:bg-white/5 hover:text-white ${
              navExpanded ? 'px-2' : 'justify-center'
            }`}
            aria-label={t('myInfo')}
            title={t('myInfo')}
          >
            <UserCircle2 size={24} className="shrink-0 text-gray-400" />
            {navExpanded && (
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-gray-200">Eternia</span>
                <span className="block truncate text-[10px] text-gray-500">{t('demoAdminSession')}</span>
              </span>
            )}
          </Link>
          {navExpanded && (
            <a
              href={loginHref}
              className="mt-2 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#4752c4] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#3c45a5]"
            >
              <LogIn size={13} />
              <span>{t('startInMyGuild')}</span>
            </a>
          )}
        </div>
      </aside>

      <nav
        aria-label={t('primaryNavigation')}
        className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#080a0e]/95 px-2 pt-1 shadow-[0_-8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:hidden"
      >
        <div
          className="grid min-h-14"
          style={{ gridTemplateColumns: `repeat(${areaItems.length}, minmax(0, 1fr))` }}
        >
          {areaItems.map((item) => {
            const Icon = DEMO_AREA_ICONS[item.area]
            const active = item.active
            const label = tNav(item.area)
            return (
              <Link
                key={item.area}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                aria-label={t('areaDestination', {
                  area: label,
                  destination: item.destinationLabel,
                })}
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 transition-colors active:bg-white/5 ${
                  active ? 'text-amber-300' : 'text-gray-500'
                }`}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="max-w-full truncate text-[10px] font-medium leading-tight">
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
