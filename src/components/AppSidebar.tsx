'use client'

import { Fragment, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { GuardedLink } from './UnsavedChangesProvider'
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
  ShieldAlert,
  Hammer,
  Sparkles,
  Home,
  ClipboardList,
  Archive,
  ScrollText,
  KeyRound,
  Zap,
  ExternalLink,
} from 'lucide-react'
import type { SessionPayload } from '@/lib/session'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import { canAccessAdminPath } from '@/lib/admin-route-access'

// 사이드바 한 그룹 안의 sub-section. labelKey 없으면 헤더 없이 첫 번째 섹션
// 으로 취급. nav.section.<key> 로 i18n.
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
  // `exact` avoids matching /me when on /me/profile — needed when a more
  // specific sibling route shares the same prefix.
  exact?: boolean
  // Hidden from guests — these pages are about regear points and wouldn't
  // do anything useful for a non-member session.
  memberOnly?: boolean
  // 제작자/관리자 + 길드의 craft_regear_enabled 가 켜진 경우에만 표시.
  crafterOnly?: boolean
  // 어드민 + 길드의 craft_regear_enabled 가 켜진 경우에만 표시.
  // 토글 OFF 면 craft 운영 탭 (운영, 재고) 자체가 숨김.
  craftAdminOnly?: boolean
  // 멤버 (제작자 + 일반) + 길드의 craft_regear_enabled 가 켜진 경우에만 표시.
  // /craft/orders 처럼 크래프터 권한 없이도 발주 수주는 가능한 페이지에 사용.
  craftOrdersOnly?: boolean
  // 사이드바 sub-section. NavGroup 이 섹션 전환 시점에 작은 헤더를 끼워넣는다.
  section: SectionKey
}

const MEMBER_NAV: NavItem[] = [
  // 활동 — `/archive` 는 사이드바에서 제외하고 events 페이지 헤더의 "지난 이벤트"
  // 링크로만 진입. 기존 점유 라인을 줄여 사이드바를 가볍게.
  { href: '/', labelKey: 'events', icon: CalendarDays, section: 'activity' },
  { href: '/battles', labelKey: 'battles', icon: Swords, section: 'activity' },
  // 리기어
  { href: '/regear', labelKey: 'regearRequest', icon: ShieldCheck, memberOnly: true, section: 'regear' },
  { href: '/craft/queue', labelKey: 'craftQueue', icon: Hammer, memberOnly: true, crafterOnly: true, section: 'regear' },
  { href: '/craft/my-tasks', labelKey: 'craftMyTasks', icon: Box, memberOnly: true, crafterOnly: true, section: 'regear' },
  { href: '/craft/orders', labelKey: 'craftOrders', icon: ClipboardList, memberOnly: true, craftOrdersOnly: true, section: 'regear' },
  // 커뮤니티
  { href: '/shop', labelKey: 'shop', icon: ShoppingBag, section: 'community' },
  { href: '/members', labelKey: 'members', icon: Users, section: 'community' },
  { href: '/leaderboard', labelKey: 'leaderboard', icon: Trophy, section: 'community' },
  // 내 정보
  { href: '/me', labelKey: 'myWallet', icon: Wallet, exact: true, memberOnly: true, section: 'profile' },
  { href: '/me/settings', labelKey: 'mySettings', icon: Settings, section: 'profile' },
]

const ADMIN_NAV: NavItem[] = [
  // 운영
  // `/admin/dashboard`는 다른 모든 관리자 라우트의 부모이기도 해서,
  // exact 매칭이 없으면 하위 페이지에 있을 때도 "이벤트 관리"가 계속 하이라이트됨.
  { href: '/admin/dashboard', labelKey: 'eventAdmin', icon: CalendarDays, exact: true, section: 'ops' },
  { href: '/admin/dashboard/approvals', labelKey: 'approvals', icon: ShieldCheck, section: 'ops' },
  // 보급/재화
  { href: '/admin/dashboard/shop', labelKey: 'shopAdmin', icon: ShoppingBag, section: 'adminSupply' },
  { href: '/admin/dashboard/siphon', labelKey: 'siphonAdmin', icon: Zap, section: 'adminSupply' },
  { href: '/admin/dashboard/craft', labelKey: 'craftAdmin', icon: Hammer, craftAdminOnly: true, section: 'adminSupply' },
  { href: '/admin/dashboard/inventory', labelKey: 'inventoryAdmin', icon: Boxes, craftAdminOnly: true, section: 'adminSupply' },
  // 분석/기록
  { href: '/admin/dashboard/stats', labelKey: 'stats', icon: BarChart3, section: 'adminInsight' },
  { href: '/admin/dashboard/audit', labelKey: 'audit', icon: ScrollText, section: 'adminInsight' },
  // 길드 설정
  { href: '/admin/dashboard/guild-profile', labelKey: 'guildProfile', icon: Sparkles, section: 'adminSettings' },
  { href: '/admin/dashboard/permissions', labelKey: 'permissions', icon: KeyRound, section: 'adminSettings' },
  { href: '/admin/dashboard/settings', labelKey: 'settings', icon: Settings, section: 'adminSettings' },
  { href: '/admin/dashboard/backup', labelKey: 'backup', icon: Archive, section: 'adminSettings' },
]

// 슈퍼어드민 (멀티테넌트 운영자) 메뉴. SUPER_ADMIN_DISCORD_IDS env 에 등록된
// 사용자에게만 노출. 라벨은 i18n 통합 전이라 한글 하드코딩 — Phase 5 에서
// nav.* 키로 이전 예정.
//
// href 는 SUPER_ADMIN_PATH env 로 randomize 가능 — superAdminPath prop 으로
// 받아 동적 빌드. AppShell 이 슈퍼어드민 세션에만 path 를 prop 으로 넘긴다.
interface SuperAdminNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  exact?: boolean
}

function buildSuperAdminNav(basePath: string): SuperAdminNavItem[] {
  return [
    { href: basePath, label: '시스템 대시보드', icon: BarChart3, exact: true },
    { href: `${basePath}/tenants`, label: '테넌트', icon: Users },
    { href: `${basePath}/notices`, label: '시스템 공지', icon: ShieldAlert },
    { href: `${basePath}/audit`, label: '감사 로그', icon: BookOpen },
  ]
}

const STORAGE_KEY = 'app.sidebar.open'
const MEMBER_GROUP_KEY = 'app.sidebar.memberOpen.v2'
const ADMIN_GROUP_KEY = 'app.sidebar.adminOpen.v2'
const SUPER_ADMIN_GROUP_KEY = 'app.sidebar.superAdminOpen.v2'
// 접힌 sub-section 들의 SectionKey 집합을 JSON 배열로 직렬화.
const SECTION_COLLAPSED_KEY = 'app.sidebar.sectionCollapsed.v3'
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

function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null
  const ext = avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=64`
}

function isActivePath(pathname: string, href: string, exact: boolean = false): boolean {
  if (href === '/') return pathname === '/'
  if (exact) return pathname === href
  // Parent routes stay highlighted while the user drills into children.
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface AppSidebarProps {
  session: SessionPayload | null
  adminBadges: AdminBadgeCounts | null
  brandName: string
  isSuperAdmin: boolean
  canSeeAdminNav: boolean
  // 슈퍼어드민 외부 path. 슈퍼어드민 세션이 아니면 null — randomized path 가
  // 일반 클라이언트 HTML 에 노출되지 않도록 AppShell 이 게이팅한다.
  superAdminPath: string | null
  // craft_regear_enabled = true 이고, 본인이 is_crafter 또는 admin 인 경우에만 true.
  craftQueueVisible: boolean
  // craft_regear_enabled = true 이고, 본인이 admin 인 경우에만 true.
  // 어드민 nav 의 craft / inventory 탭 가시성에 영향.
  craftAdminVisible: boolean
  // craft_regear_enabled = true 이고, 본인이 member 또는 admin 인 경우에만 true.
  // 멤버 nav 의 /craft/orders 탭 가시성. 토글 OFF 면 발주 보드 자체가 숨김.
  craftOrdersVisible: boolean
  // 공개 프로필 (`/g/<slug>`) 진입용 사이드바 링크. guild_profile_enabled 가
  // 꺼져 있거나 slug 가 없으면 null — AppShell 이 게이팅한다.
  publicProfileHref: string | null
  // AGM 공식 마케팅 사이트 진입점. host (canonical vs tenant subdomain) 에 따라
  // `/` 혹은 `/public/landing` 으로 다른 path 가 들어온다. 모든 세션 (게스트
  // 포함) 에게 노출.
  landingHref: string
}

export default function AppSidebar({
  session,
  adminBadges,
  brandName,
  isSuperAdmin,
  canSeeAdminNav,
  superAdminPath,
  craftQueueVisible,
  craftAdminVisible,
  craftOrdersVisible,
  publicProfileHref,
  landingHref,
}: AppSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  // 섹션 헤더 (활동/리기어/...) 라벨. NavGroup 안에서만 쓰지만 hook 은
  // 컴포넌트 최상위에서 호출해야 해서 여기서 prop 으로 내려준다.
  const tSection = useTranslations('nav.section')
  // Default collapsed on mobile, expanded on desktop. We hydrate from
  // localStorage after mount so the first paint matches the viewport.
  const [open, setOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [superAdminOpen, setSuperAdminOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // sub-section 접힘 상태. 기본은 활동/운영만 펼쳐 신규 사용자가 첫 화면에서
  // 적은 수의 탭만 보게 한다. 현재 라우트가 속한 섹션은 NavGroup 에서 자동으로
  // 펼쳐 경로 감각을 잃지 않게 한다.
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(
    () => new Set(DEFAULT_COLLAPSED_SECTIONS),
  )

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const memberStored = window.localStorage.getItem(MEMBER_GROUP_KEY)
    const adminStored = window.localStorage.getItem(ADMIN_GROUP_KEY)
    const superAdminStored = window.localStorage.getItem(SUPER_ADMIN_GROUP_KEY)
    const sectionStored = window.localStorage.getItem(SECTION_COLLAPSED_KEY)
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches
    // mount-only localStorage hydration. SSR 단계에선 알 수 없는 클라이언트 prefs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(stored === null ? wideScreen : stored === 'true')
    const onAdminRoute = (window.location.pathname || '').startsWith('/admin')
    if (memberStored !== null) setMemberOpen(memberStored === 'true')
    else setMemberOpen(!onAdminRoute)
    if (adminStored !== null) setAdminOpen(adminStored === 'true')
    else setAdminOpen(onAdminRoute)
    if (superAdminStored !== null) setSuperAdminOpen(superAdminStored === 'true')
    // 잘못된 JSON 이거나 알 수 없는 키가 들어 있어도 무시 — 다음 토글 때 깨끗한 상태로 덮어쓴다.
    if (sectionStored !== null) {
      try {
        const parsed = JSON.parse(sectionStored)
        if (Array.isArray(parsed)) {
          setCollapsedSections(new Set(parsed.filter((k): k is SectionKey => typeof k === 'string')))
        }
      } catch (e) {
        console.error('[AppSidebar] failed to parse collapsed-sections localStorage value:', e)
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
    if (hydrated) window.localStorage.setItem(SUPER_ADMIN_GROUP_KEY, String(superAdminOpen))
  }, [superAdminOpen, hydrated])
  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(SECTION_COLLAPSED_KEY, JSON.stringify([...collapsedSections]))
    }
  }, [collapsedSections, hydrated])

  // sub-section 토글. 같은 key 가 이미 있으면 제거 (펼침), 없으면 추가 (접힘).
  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    // Auto-close the drawer on route change so taps on mobile feel responsive.
    // 외부 (라우터) 상태 → 로컬 state 동기화 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDrawer(false)
  }, [pathname])

  // 모바일 드로어가 열려있을 땐 항상 풀 폭으로 노출 — 햄버거를 눌렀다는 건
  // "메뉴를 펼쳐서 보고 싶다" 는 명시적 신호이기 때문에, 데스크탑 collapse
  // 토글의 `open` 상태와 분리한다. 데스크탑(lg+) 에서는 mobileDrawer 가 항상
  // false 라 `open` 그대로 평가된다.
  const navExpanded = mobileDrawer || open

  const loginHref = `/api/auth/discord/start?returnTo=${encodeURIComponent(pathname || '/')}`
  const url = session ? avatarUrl(session.discordId, session.avatar) : null

  // "홈" 항목은 사이드바 최상단 — 길드의 캐노니컬 진입점 역할 (헤더 브랜드
  // 클릭과 동일 경로). AppShell 이 enable + slug 둘 다 충족해야 href 를 채워주고
  // (그 외엔 null → 항목 자체를 숨김), 활동 섹션의 첫 행으로 끼워 넣는다.
  const memberNavItems: NavItem[] = publicProfileHref
    ? [
        { href: publicProfileHref, labelKey: 'publicProfile', icon: Home, section: 'activity' },
        ...MEMBER_NAV,
      ]
    : MEMBER_NAV

  return (
    <>
      {/* Mobile top bar — only shown on <lg. Hamburger opens drawer. */}
      <div className="lg:hidden flex items-center justify-between border-b border-border px-4 py-3 bg-background/90 backdrop-blur-md sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setMobileDrawer(true)}
          aria-label={t('openMenu')}
          className="p-1.5 text-muted hover:text-foreground transition-colors"
        >
          <Menu size={20} />
        </button>
        <GuardedLink href={publicProfileHref ?? '/'} className="text-accent text-base font-semibold tracking-tight">⚔ {brandName}</GuardedLink>
        {session ? (
          <GuardedLink href="/me/profile" aria-label={t('myInfo')} className="flex items-center">
            {url ? (
              <Image
                src={url}
                alt=""
                width={28}
                height={28}
                className="rounded-full"
                unoptimized
              />
            ) : (
              <UserCircle2 size={24} className="text-muted" />
            )}
          </GuardedLink>
        ) : (
          <a
            href={loginHref}
            className="flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-2.5 py-1 rounded-lg"
          >
            <LogIn size={12} />
            {t('login')}
          </a>
        )}
      </div>

      {/* Mobile drawer overlay */}
      {mobileDrawer && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileDrawer(false)} />
      )}

      <aside
        className={`${
          mobileDrawer ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-dvh lg:h-screen flex-shrink-0 border-r border-border bg-surface/95 backdrop-blur-xl transition-[transform,width] duration-200 ease-out ${
          navExpanded ? 'w-64' : 'w-[64px]'
        } lg:w-auto ${open ? 'lg:w-64' : 'lg:w-[64px]'} flex flex-col overflow-hidden`}
      >
        {/* Brand + collapse toggle */}
        <div className={`flex items-center ${navExpanded ? 'justify-between px-4' : 'justify-center'} h-14 border-b border-border flex-shrink-0`}>
          {navExpanded && (
            <GuardedLink href={publicProfileHref ?? '/'} className="text-accent font-semibold text-[15px] tracking-tight flex items-center gap-2 truncate">
              ⚔ <span>{brandName}</span>
            </GuardedLink>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileDrawer(false)}
              aria-label={t('close')}
              className="lg:hidden text-muted hover:text-foreground p-1.5 transition-colors"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t('collapse') : t('expand')}
              className="hidden lg:inline text-muted hover:text-foreground p-1.5 transition-colors"
            >
              {open ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          <NavGroup
            title={t('memberGroup')}
            items={memberNavItems
              .filter((i) => !i.memberOnly || session?.isMember)
              .filter((i) => !i.crafterOnly || craftQueueVisible)
              .filter((i) => !i.craftOrdersOnly || craftOrdersVisible)
              .map((i) => ({ ...i, label: tNav(i.labelKey) }))}
            pathname={pathname || '/'}
            expanded={navExpanded}
            collapsible={memberOpen}
            setCollapsible={setMemberOpen}
            sectionLabel={(key) => tSection(key)}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
          />
          {canSeeAdminNav && (
            <NavGroup
              title={t('adminGroup')}
              items={ADMIN_NAV
                .filter((i) =>
                  canAccessAdminPath(i.href, session?.isAdmin ?? false, session?.capabilities),
                )
                .filter((i) => !i.craftAdminOnly || craftAdminVisible)
                .map((i) => ({
                  ...i,
                  label: tNav(i.labelKey),
                  badge: badgeCountFor(i.href, adminBadges),
                }))}
              pathname={pathname || '/'}
              expanded={navExpanded}
              collapsible={adminOpen}
              setCollapsible={setAdminOpen}
              sectionLabel={(key) => tSection(key)}
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
            />
          )}
          {isSuperAdmin && superAdminPath && (
            <NavGroup
              title="SUPER ADMIN"
              items={buildSuperAdminNav(superAdminPath).map((i) => ({
                href: i.href,
                labelKey: i.label,
                label: i.label,
                icon: i.icon,
                exact: i.exact,
                // 슈퍼어드민 nav 는 단일 섹션 — NavGroup 이 sub-section 헤더를 자동 생략.
                section: 'system' as SectionKey,
              }))}
              pathname={pathname || '/'}
              expanded={navExpanded}
              collapsible={superAdminOpen}
              setCollapsible={setSuperAdminOpen}
              sectionLabel={(key) => tSection(key)}
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
            />
          )}
        </nav>

        {/* Footer extras — 메인 nav 와 세션 footer 사이의 보조 링크들.
            공식 사이트 (모든 세션, 길드 페이지에서 AGM 마케팅 사이트로 빠지는 통로) +
            어드민 운영 가이드 (admin 한정). 펼침 시 라벨, 접힘 시 아이콘만. */}
        <div className={`border-t border-border flex-shrink-0 space-y-0.5 ${navExpanded ? 'px-3 pt-2 pb-1' : 'px-2 pt-2 pb-1'}`}>
          <GuardedLink
            href={landingHref}
            title={navExpanded ? undefined : tNav('officialSite')}
            className={`flex items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
              navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
            }`}
          >
            <ExternalLink size={navExpanded ? 13 : 16} className="flex-shrink-0" />
            {navExpanded && <span className="truncate">{tNav('officialSite')}</span>}
          </GuardedLink>
          {canAccessAdminPath(
            '/admin/dashboard/guide',
            session?.isAdmin ?? false,
            session?.capabilities,
          ) && (
            <GuardedLink
              href="/admin/dashboard/guide"
              title={navExpanded ? undefined : tNav('guide')}
              className={`flex items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
                navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
              } ${
                isActivePath(pathname || '/', '/admin/dashboard/guide')
                  ? 'text-accent-soft-foreground bg-accent-soft'
                  : ''
              }`}
            >
              <BookOpen size={navExpanded ? 13 : 16} className="flex-shrink-0" />
              {navExpanded && <span className="truncate">{tNav('guide')}</span>}
            </GuardedLink>
          )}
        </div>

        {/* Footer — session info */}
        <div className={`border-t border-border flex-shrink-0 ${navExpanded ? 'px-3 py-3' : 'px-2 py-3'}`}>
          {session ? (
            <div className={`flex ${navExpanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'}`}>
              <GuardedLink
                href="/me/profile"
                className={`flex items-center gap-2 min-w-0 flex-1 hover:text-foreground transition-colors ${navExpanded ? '' : 'justify-center'}`}
                aria-label={t('myInfo')}
                title={t('myInfo')}
              >
                {url ? (
                  <Image
                    src={url}
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-full flex-shrink-0"
                    unoptimized
                  />
                ) : (
                  <UserCircle2 size={24} className="text-muted flex-shrink-0" />
                )}
                {navExpanded && (
                  <span className="text-muted text-xs font-medium truncate">{session.username}</span>
                )}
              </GuardedLink>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex items-center gap-1 text-subtle hover:text-danger-soft-foreground p-1.5 transition-colors"
                  aria-label={t('logout')}
                  title={t('logout')}
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          ) : (
            <a
              href={loginHref}
              className={`flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold rounded-lg transition-colors ${navExpanded ? 'text-xs px-3 py-2 justify-center' : 'justify-center p-2'}`}
            >
              <LogIn size={13} />
              {navExpanded && <span>{t('discordLogin')}</span>}
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

// Maps an admin nav href to its pending count for the sidebar badge. The
// unified approvals entry shows the sum across all three request types so the
// operator sees a single "queue" size without drilling into sub-tabs.
function badgeCountFor(href: string, badges: AdminBadgeCounts | null): number {
  if (!badges) return 0
  if (href === '/admin/dashboard/approvals') {
    return badges.regear + badges.exchange + badges.donation + badges.shop + badges.eventPayout
  }
  return 0
}

interface NavGroupProps {
  title: string
  items: ResolvedNavItem[]
  pathname: string
  expanded: boolean
  collapsible: boolean
  setCollapsible: (next: boolean) => void
  // sub-section 헤더 라벨 (활동/리기어/...).
  sectionLabel: (key: SectionKey) => string
  // 접힌 sub-section 들의 SectionKey Set. 헤더 chevron 회전과 항목 hide 에 사용.
  collapsedSections: Set<SectionKey>
  onToggleSection: (key: SectionKey) => void
}

interface SectionBucket {
  section: SectionKey
  items: ResolvedNavItem[]
}

// items 의 인접한 같은 section 끼리 연속으로 묶어 하나의 bucket 으로 만든다.
// section 끼리 비연속으로 끼어 있으면 두 번째 등장은 별도 bucket — 하지만
// 현재 데이터에선 이런 케이스가 없도록 MEMBER_NAV / ADMIN_NAV 가 정렬돼 있다.
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

// nav 항목 한 줄. 접힘/펼침 상태에 따라 라벨 또는 아이콘만.
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
    <GuardedLink
      href={href}
      title={expanded ? undefined : label}
      className={`relative flex items-center gap-3 rounded-lg transition-colors ${
        expanded ? 'px-3 py-2 text-sm' : 'justify-center p-2'
      } ${
        active
          ? 'bg-accent-soft text-accent-soft-foreground'
          : 'text-muted hover:text-foreground hover:bg-surface-2'
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
    </GuardedLink>
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
  // 그룹 안에 sub-section 이 1개면 헤더를 표시할 의미가 없다 (super-admin nav 케이스).
  // 또 사이드바를 접은 상태 (좁은 폭) 에선 sub-section 헤더를 숨기고 아이콘만.
  const showSubHeaders = expanded && buckets.length > 1
  const groupHasActive = items.some((item) => isActivePath(pathname, item.href, item.exact))
  const groupOpen = collapsible || !expanded || groupHasActive
  return (
    <div className="px-2 space-y-1">
      {expanded ? (
        <button
          type="button"
          onClick={() => setCollapsible(!collapsible)}
          className="w-full flex items-center justify-between px-2 text-[10px] font-semibold text-subtle uppercase tracking-widest hover:text-muted transition-colors"
        >
          <span>{title}</span>
          <ChevronDown
            size={12}
            className={`transition-transform ${groupOpen ? '' : '-rotate-90'}`}
          />
        </button>
      ) : (
        <div className="border-t border-border mx-2 my-1" aria-label={title} />
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
                    className="w-full flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-medium text-muted hover:text-foreground tracking-wide transition-colors"
                  >
                    <span>{sectionLabel(bucket.section)}</span>
                    <ChevronDown
                      size={12}
                      className={`transition-transform text-subtle ${sectionCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                  {!sectionCollapsed &&
                    bucket.items.map((item) => (
                      <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
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
