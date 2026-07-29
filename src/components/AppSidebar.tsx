'use client'

import { Fragment, useEffect, useRef, useState, type ComponentProps } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
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
  Store,
  Sparkles,
  Home,
  ClipboardList,
  Archive,
  ScrollText,
  KeyRound,
  Zap,
  ExternalLink,
  LayoutTemplate,
  Wrench,
  Bot,
  Map,
  Video,
} from 'lucide-react'
import type { SessionPayload } from '@/lib/session'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import { canAccessAdminPath } from '@/lib/admin-route-access'
import { BATTLELOG_FEATURES_PAUSED } from '@/lib/battlelog-pause'
import { PUBLIC_AGM_BATTLES_AVAILABLE } from '@/lib/public-agm-battles-visibility'
import {
  getNavigationSearchAliasKey,
  groupNavigationByArea,
} from '@/lib/app-navigation'
import {
  buildLoginEntryHref,
  buildReturnToWithSearchParams,
} from '@/lib/login-entry'
import {
  resolveAppArea,
  resolveAppCurrentRouteHint,
  type AppArea,
} from '@/lib/app-route-registry'
import { useContextualAreaNavigation } from '@/hooks/use-contextual-area-navigation'
import AreaNavigation, { type AreaNavigationItem } from './AreaNavigation'
import UserStatusChip, { type UserStatusSummary } from './UserStatusChip'

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
  // Menhera 전용 연합 컨텐츠 준수 기능. AppShell 이 tenant slug + 전용 setting
  // 을 모두 확인한 경우에만 노출하며, route/action 도 독립적으로 같은 gate 를 건다.
  allianceContentOnly?: boolean
  // 사이드바 sub-section. NavGroup 이 섹션 전환 시점에 작은 헤더를 끼워넣는다.
  section: SectionKey
}

const MEMBER_NAV: NavItem[] = [
  // 기본 노출은 오늘 + 전체 이벤트 두 경로만. 탐색성 기능은 접힌 섹션에 두어
  // 첫 진입의 선택 피로를 줄이되 기존 기능 접근은 유지한다.
  { href: '/', labelKey: 'today', icon: Home, exact: true, section: 'activity' },
  { href: '/events', labelKey: 'events', icon: CalendarDays, section: 'activity' },
  { href: '/battles', labelKey: 'battles', icon: Swords, section: 'features' },
  { href: '/tactics', labelKey: 'tactics', icon: Map, section: 'features' },
  // 리기어
  { href: '/regear', labelKey: 'regearRequest', icon: ShieldCheck, memberOnly: true, section: 'regear' },
  { href: '/craft/queue', labelKey: 'craftQueue', icon: Hammer, memberOnly: true, crafterOnly: true, section: 'regear' },
  { href: '/craft/my-tasks', labelKey: 'craftMyTasks', icon: Box, memberOnly: true, crafterOnly: true, section: 'regear' },
  { href: '/craft/inventory', labelKey: 'craftInventory', icon: Boxes, memberOnly: true, crafterOnly: true, section: 'regear' },
  { href: '/craft/orders', labelKey: 'craftOrders', icon: ClipboardList, memberOnly: true, craftOrdersOnly: true, section: 'regear' },
  // 커뮤니티
  { href: '/shop', labelKey: 'shop', icon: ShoppingBag, section: 'community' },
  { href: '/market', labelKey: 'memberMarket', icon: Store, memberOnly: true, section: 'community' },
  { href: '/members', labelKey: 'members', icon: Users, section: 'community' },
  { href: '/leaderboard', labelKey: 'leaderboard', icon: Trophy, section: 'community' },
  // 내 정보
  { href: '/me', labelKey: 'myWallet', icon: Wallet, exact: true, memberOnly: true, section: 'profile' },
  { href: '/me/content-compliance', labelKey: 'contentCompliance', icon: Video, memberOnly: true, allianceContentOnly: true, section: 'profile' },
  { href: '/me/settings', labelKey: 'mySettings', icon: Settings, section: 'profile' },
]

const ADMIN_NAV: NavItem[] = [
  // 운영
  // `/admin/dashboard`는 다른 모든 관리자 라우트의 부모이기도 해서,
  // exact 매칭이 없으면 하위 페이지에 있을 때도 "이벤트 관리"가 계속 하이라이트됨.
  { href: '/admin/dashboard', labelKey: 'adminToday', icon: Home, exact: true, section: 'ops' },
  { href: '/admin/dashboard/events', labelKey: 'eventAdmin', icon: CalendarDays, section: 'ops' },
  { href: '/admin/dashboard/approvals', labelKey: 'approvals', icon: ShieldCheck, section: 'ops' },
  { href: '/admin/dashboard/members', labelKey: 'memberOperations', icon: Users, section: 'ops' },
  { href: '/admin/dashboard/builds', labelKey: 'buildTemplates', icon: LayoutTemplate, section: 'features' },
  { href: '/admin/dashboard/tactics', labelKey: 'tactics', icon: Map, section: 'features' },
  // 보급/재화
  { href: '/admin/dashboard/shop', labelKey: 'shopAdmin', icon: ShoppingBag, section: 'adminSupply' },
  { href: '/admin/dashboard/siphon', labelKey: 'siphonAdmin', icon: Zap, section: 'adminSupply' },
  { href: '/admin/dashboard/loot-audit', labelKey: 'lootAudit', icon: ScrollText, section: 'adminSupply' },
  { href: '/admin/dashboard/craft', labelKey: 'craftAdmin', icon: Hammer, craftAdminOnly: true, section: 'adminSupply' },
  { href: '/admin/dashboard/inventory', labelKey: 'inventoryAdmin', icon: Boxes, craftAdminOnly: true, section: 'adminSupply' },
  // 분석/기록
  { href: '/admin/dashboard/stats', labelKey: 'stats', icon: BarChart3, section: 'adminInsight' },
  { href: '/admin/dashboard/content-compliance', labelKey: 'contentCompliance', icon: Video, allianceContentOnly: true, section: 'adminInsight' },
  { href: '/admin/dashboard/killbot', labelKey: 'killbot', icon: Bot, section: 'adminInsight' },
  { href: '/admin/dashboard/audit', labelKey: 'audit', icon: ScrollText, section: 'adminInsight' },
  // 길드 설정
  { href: '/admin/dashboard/guild-profile', labelKey: 'guildProfile', icon: Sparkles, section: 'adminSettings' },
  { href: '/admin/dashboard/permissions', labelKey: 'permissions', icon: KeyRound, section: 'adminSettings' },
  { href: '/admin/dashboard/settings', labelKey: 'settings', icon: Settings, section: 'adminSettings' },
  { href: '/admin/dashboard/backup', labelKey: 'backup', icon: Archive, section: 'adminSettings' },
]

// 슈퍼어드민 (멀티테넌트 운영자) 메뉴. SUPER_ADMIN_DISCORD_IDS env 에 등록된
// 사용자에게만 노출.
//
// href 는 SUPER_ADMIN_PATH env 로 randomize 가능 — superAdminPath prop 으로
// 받아 동적 빌드. AppShell 이 슈퍼어드민 세션에만 path 를 prop 으로 넘긴다.
interface SuperAdminNavItem {
  href: string
  labelKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  exact?: boolean
}

function buildSuperAdminNav(basePath: string): SuperAdminNavItem[] {
  return [
    { href: basePath, labelKey: 'superDashboard', icon: BarChart3, exact: true },
    { href: `${basePath}/tenants`, labelKey: 'superTenants', icon: Users },
    { href: `${basePath}/notices`, labelKey: 'superNotices', icon: ShieldAlert },
    { href: `${basePath}/diagnostics`, labelKey: 'superDiagnostics', icon: Wrench },
    { href: `${basePath}/audit`, labelKey: 'superAudit', icon: BookOpen },
  ]
}

const STORAGE_KEY = 'app.sidebar.open'
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

const MOBILE_NAV_ICONS: Record<
  AppArea,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  today: Home,
  operations: Swords,
  supply: Boxes,
  records: ScrollText,
  guild: Users,
}

function searchAliasFor(
  labelKey: string,
  translate: (key: 'regear' | 'inventory' | 'approvals' | 'permissions' | 'settings' | 'backup') => string,
): string | undefined {
  const aliasKey = getNavigationSearchAliasKey(labelKey)
  return aliasKey ? translate(aliasKey) : undefined
}

function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null
  const ext = avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=64`
}

function MobileAccountLink({
  href,
  avatarSrc,
  username,
  label,
}: {
  href: string
  avatarSrc: string | null
  username: string
  label: string
}) {
  return (
    <GuardedLink
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface/90 text-muted shadow-card ring-1 ring-white/[0.08] transition-[box-shadow,color,transform] hover:text-foreground hover:shadow-lift active:scale-[0.96]"
    >
      {avatarSrc ? (
        <Image
          src={avatarSrc}
          alt=""
          width={40}
          height={40}
          className="h-full w-full rounded-full object-cover"
          unoptimized
        />
      ) : (
        <UserCircle2 size={20} aria-hidden="true" />
      )}
      <span className="sr-only">{username}</span>
    </GuardedLink>
  )
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
  // AGM 공식 마케팅 사이트 진입점. tenant host 에서는 canonical root 절대 URL,
  // preview/localhost 에서는 `/public/landing` 가 들어온다. 모든 세션 (게스트 포함) 에게 노출.
  landingHref: string
  // 공개 도움말 문서. tenant host 에서는 canonical root 절대 URL.
  docsHref: string
  // 전체 공개 전투 보드. tenant host 에서는 canonical root 절대 URL.
  publicBattlesHref: string
  userStatus: UserStatusSummary | null
  allianceEventAllowed: boolean
  allianceContentComplianceVisible: boolean
  visualRefreshEnabled: boolean
  memberTourAvailable: boolean
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
  docsHref,
  publicBattlesHref,
  userStatus,
  allianceEventAllowed,
  allianceContentComplianceVisible,
  visualRefreshEnabled,
  memberTourAvailable,
}: AppSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  const tSearchAliases = useTranslations('sidebar.searchAliases')
  // 섹션 헤더 (활동/리기어/...) 라벨. NavGroup 안에서만 쓰지만 hook 은
  // 컴포넌트 최상위에서 호출해야 해서 여기서 prop 으로 내려준다.
  const tSection = useTranslations('nav.section')
  const isLocalGuildAccount = session?.isLocalGuildAccount === true
  const eventScope = session?.isGuest === true ? session.eventScope : null
  const eventScopeHref = eventScope
    ? `/events/${encodeURIComponent(eventScope)}`
    : null
  const isBombSquadCallerOnly =
    session?.isBombSquadCaller === true &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest
  const isAllianceCandidateOnly =
    session?.isAllianceCandidate === true &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest &&
    !session.isBombSquadCaller
  const isAllianceEventOnly =
    allianceEventAllowed &&
    !!session &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest
  // Default collapsed on mobile, expanded on desktop. We hydrate from
  // localStorage after mount so the first paint matches the viewport.
  const [open, setOpen] = useState(false)
  const [superAdminOpen, setSuperAdminOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)
  const shouldRestoreMobileMenuFocus = useRef(false)
  // sub-section 접힘 상태. 기본은 활동/운영만 펼쳐 신규 사용자가 첫 화면에서
  // 적은 수의 탭만 보게 한다. 현재 라우트가 속한 섹션은 NavGroup 에서 자동으로
  // 펼쳐 경로 감각을 잃지 않게 한다.
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(
    () => new Set(DEFAULT_COLLAPSED_SECTIONS),
  )

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const superAdminStored = window.localStorage.getItem(SUPER_ADMIN_GROUP_KEY)
    const sectionStored = window.localStorage.getItem(SECTION_COLLAPSED_KEY)
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches
    // mount-only localStorage hydration. SSR 단계에선 알 수 없는 클라이언트 prefs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(stored === null ? wideScreen : stored === 'true')
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
    shouldRestoreMobileMenuFocus.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDrawer(false)
  }, [pathname])

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

  // 모바일 드로어가 열려있을 땐 항상 풀 폭으로 노출 — 햄버거를 눌렀다는 건
  // "메뉴를 펼쳐서 보고 싶다" 는 명시적 신호이기 때문에, 데스크탑 collapse
  // 토글의 `open` 상태와 분리한다. 데스크탑(lg+) 에서는 mobileDrawer 가 항상
  // false 라 `open` 그대로 평가된다.
  const navExpanded = mobileDrawer || open

  const searchParams = useSearchParams()
  const loginHref = buildLoginEntryHref({
    returnTo: buildReturnToWithSearchParams(pathname || '/', searchParams.entries()),
  })
  const url = session ? avatarUrl(session.discordId, session.avatar) : null

  // "홈" 항목은 사이드바 최상단 — 길드의 캐노니컬 진입점 역할 (헤더 브랜드
  // 클릭과 동일 경로). AppShell 이 enable + slug 둘 다 충족해야 href 를 채워주고
  // (그 외엔 null → 항목 자체를 숨김), 활동 섹션의 첫 행으로 끼워 넣는다.
  const baseMemberNavItems = eventScopeHref
    ? MEMBER_NAV
        .filter((item) => item.href === '/events')
        .map((item) => ({ ...item, href: eventScopeHref }))
    : isAllianceCandidateOnly && !allianceEventAllowed
    ? []
    : isBombSquadCallerOnly || isAllianceEventOnly
    ? MEMBER_NAV.filter((item) => item.href === '/' || item.href === '/events')
    : MEMBER_NAV
  const visibleBaseMemberNavItems = baseMemberNavItems.filter((item) =>
    !BATTLELOG_FEATURES_PAUSED || item.href !== '/battles',
  )
  const memberNavItems: NavItem[] = publicProfileHref && !eventScopeHref && !isBombSquadCallerOnly && !isAllianceEventOnly
    ? [
        { href: publicProfileHref, labelKey: 'publicProfile', icon: Home, section: 'activity' },
        ...visibleBaseMemberNavItems,
      ]
    : visibleBaseMemberNavItems
  const sessionProfileHref = eventScopeHref ?? (isAllianceCandidateOnly && !allianceEventAllowed
    ? '/onboarding/albion'
    : isBombSquadCallerOnly || isAllianceEventOnly
      ? '/'
      : '/me')
  const brandHref = eventScopeHref ?? publicProfileHref ?? '/'
  const sessionProfileLabel = eventScopeHref ? tNav('operations') : t('myInfo')
  const memberNavigationVisible = !(isAllianceCandidateOnly && !allianceEventAllowed)
  const discoveryMemberNavItems: NavItem[] = memberNavigationVisible
    ? memberNavItems
    : [{
        href: sessionProfileHref,
        labelKey: 'guild',
        icon: Users,
        section: 'profile',
      }]
  const visibleMemberTools: AreaNavigationItem[] = discoveryMemberNavItems
    .filter((i) =>
      !isLocalGuildAccount || i.href === '/' || i.href === '/events' || i.href === '/regear',
    )
    .filter((i) => !i.memberOnly || session?.isMember)
    .filter((i) => !i.crafterOnly || craftQueueVisible)
    .filter((i) => !i.craftOrdersOnly || craftOrdersVisible)
    .filter((i) => !i.allianceContentOnly || allianceContentComplianceVisible)
    .map((i) => ({
      ...i,
      label: tNav(i.labelKey),
      aliases: searchAliasFor(i.labelKey, tSearchAliases),
    }))
  const visibleAdminTools: AreaNavigationItem[] = canSeeAdminNav
    ? ADMIN_NAV
        .filter((i) => !BATTLELOG_FEATURES_PAUSED || i.href !== '/admin/dashboard/killbot')
        .filter((i) =>
          canAccessAdminPath(i.href, session?.isAdmin ?? false, session?.capabilities),
        )
        .filter((i) => !i.craftAdminOnly || craftAdminVisible)
        .filter((i) => !i.allianceContentOnly || allianceContentComplianceVisible)
        .map((i) => ({
          ...i,
          label: tNav(i.labelKey),
          aliases: searchAliasFor(i.labelKey, tSearchAliases),
          badge: badgeCountFor(i.href, adminBadges),
        }))
    : []
  const areaNavigationGroups = groupNavigationByArea(
    visibleMemberTools,
    visibleAdminTools,
  ).map((group) => ({
    ...group,
    label: tNav(group.area),
    icon: MOBILE_NAV_ICONS[group.area],
  }))
  const currentHref = pathname || '/'
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
  const navigationStorageScope = [
    session?.guildId ?? 'no-guild',
    session?.discordId ?? 'anonymous',
  ].join('.')
  const {
    destinations: mobilePrimaryItems,
    activeAudience,
    recentHrefs,
  } = useContextualAreaNavigation({
    currentHref,
    groups: areaNavigationGroups,
    storageScope: navigationStorageScope,
    fallbackAudience: 'member',
    currentContext,
  })
  const activeArea: AppArea = resolvedCurrentArea
    ?? mobilePrimaryItems[0]?.area
    ?? 'today'

  return (
    <>
      {/* Mobile top bar — identity and status only. Primary navigation stays at thumb reach. */}
      <div className={`safe-area-top lg:hidden grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 pb-3 bg-background/90 backdrop-blur-md sticky top-0 z-30${visualRefreshEnabled ? ' v3-navigation' : ''}`}>
        <button
          ref={mobileMoreTriggerRef}
          data-mobile-scroll-lock-trigger="app-drawer"
          type="button"
          onClick={() => {
            shouldRestoreMobileMenuFocus.current = true
            setMobileDrawer(true)
          }}
          aria-label={t('openMenu')}
          aria-expanded={mobileDrawer}
          aria-controls="app-sidebar-navigation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Menu size={19} />
        </button>
        <GuardedLink href={brandHref} className="flex min-w-0 flex-col justify-center truncate">
          <span className="truncate text-base font-semibold tracking-tight text-accent">⚔ {brandName}</span>
          <span className="truncate text-[10px] font-medium text-subtle">
            {tNav(activeArea)} · {activeAudience === 'operator' ? t('guildOperations') : t('myWork')}
          </span>
        </GuardedLink>
        {session ? (
          userStatus && !eventScopeHref ? (
            <UserStatusChip
              summary={userStatus}
              compact
              className="max-w-[46vw]"
              tourId="member-tour-status-chip"
            />
          ) : (
            <MobileAccountLink
              href={sessionProfileHref}
              avatarSrc={url}
              username={session.username}
              label={sessionProfileLabel}
            />
          )
        ) : (
          <a
            href={loginHref}
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#5865F2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4752c4]"
          >
            <LogIn size={12} />
            {t('login')}
          </a>
        )}
      </div>

      {/* Mobile drawer overlay */}
      {mobileDrawer && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => {
            shouldRestoreMobileMenuFocus.current = true
            setMobileDrawer(false)
          }}
          aria-hidden="true"
        />
      )}

      <aside
        ref={mobileDrawerRef}
        id="app-sidebar-navigation"
        role={mobileDrawer ? 'dialog' : undefined}
        aria-modal={mobileDrawer ? true : undefined}
        data-mobile-scroll-lock-overlay={mobileDrawer ? 'app-drawer' : undefined}
        aria-label={mobileDrawer ? t('navigation') : undefined}
        className={`${visualRefreshEnabled ? 'v3-navigation ' : ''}${
          mobileDrawer ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'
        } safe-area-drawer lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-dvh lg:h-screen flex-shrink-0 border-r border-border bg-surface/95 backdrop-blur-xl transition-[transform,width,visibility] duration-200 ease-out ${
          navExpanded ? 'w-64' : 'w-[64px]'
        } lg:w-auto ${open ? 'lg:w-64' : 'lg:w-[64px]'} flex flex-col overflow-hidden`}
      >
        {/* Brand + collapse toggle */}
        <div className={`flex items-center ${navExpanded ? 'justify-between px-4' : 'justify-center'} h-14 border-b border-border flex-shrink-0`}>
          {navExpanded && (
            <GuardedLink href={brandHref} className="text-accent font-semibold text-[15px] tracking-tight flex items-center gap-2 truncate">
              ⚔ <span>{brandName}</span>
            </GuardedLink>
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t('collapse') : t('expand')}
              aria-expanded={open}
              aria-controls="app-sidebar-navigation"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground lg:inline-flex"
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
            destinations={mobilePrimaryItems}
            recentHrefs={recentHrefs}
            activeArea={activeArea}
            currentHref={currentHref}
            expanded={navExpanded}
            searchEnabled={!eventScopeHref}
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
          {isSuperAdmin && superAdminPath && (
            <div className="border-t border-border pt-3">
            <NavGroup
              title={t('superAdminGroup')}
              items={buildSuperAdminNav(superAdminPath).map((i) => ({
                href: i.href,
                labelKey: i.labelKey,
                label: tNav(i.labelKey),
                icon: i.icon,
                exact: i.exact,
                // 슈퍼어드민 nav 는 단일 섹션 — NavGroup 이 sub-section 헤더를 자동 생략.
                section: 'system' as SectionKey,
              }))}
              pathname={pathname || '/'}
              expanded={navExpanded}
              collapsible={superAdminOpen}
              setCollapsible={setSuperAdminOpen}
              contentId="super-admin-navigation"
              sectionLabel={(key) => tSection(key)}
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
            />
            </div>
          )}
        </nav>

        {/* Footer extras — 메인 nav 와 세션 footer 사이의 보조 링크들.
            공식 사이트 (모든 세션, 길드 페이지에서 AGM 마케팅 사이트로 빠지는 통로) +
            어드민 운영 가이드 (admin 한정). 펼침 시 라벨, 접힘 시 아이콘만. */}
        {!eventScopeHref && <div className={`border-t border-border flex-shrink-0 space-y-0.5 ${navExpanded ? 'px-3 pt-2 pb-1' : 'px-2 pt-2 pb-1'}`}>
          {memberTourAvailable && (
            <div
              id="member-tour-launcher"
              className={navExpanded ? '' : '[&_.tour-restart-label]:hidden'}
            />
          )}
          <GuardedLink
            href={landingHref}
            title={navExpanded ? undefined : tNav('officialSite')}
            className={`flex min-h-10 items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
              navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
            }`}
          >
            <ExternalLink size={navExpanded ? 13 : 16} className="flex-shrink-0" />
            {navExpanded && <span className="truncate">{tNav('officialSite')}</span>}
          </GuardedLink>
          <GuardedLink
            href={docsHref}
            title={navExpanded ? undefined : tNav('docs')}
            className={`flex min-h-10 items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
              navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
            }`}
          >
            <BookOpen size={navExpanded ? 13 : 16} className="flex-shrink-0" />
            {navExpanded && <span className="truncate">{tNav('docs')}</span>}
          </GuardedLink>
          {PUBLIC_AGM_BATTLES_AVAILABLE && (
            <GuardedLink
              href={publicBattlesHref}
              title={navExpanded ? undefined : tNav('publicBattles')}
              className={`flex min-h-10 items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
                navExpanded ? 'gap-2 px-3 py-1.5 text-xs' : 'justify-center p-2'
              }`}
            >
              <Swords size={navExpanded ? 13 : 16} className="flex-shrink-0" />
              {navExpanded && <span className="truncate">{tNav('publicBattles')}</span>}
            </GuardedLink>
          )}
          {canAccessAdminPath(
            '/admin/dashboard/guide',
            session?.isAdmin ?? false,
            session?.capabilities,
          ) && (
            <GuardedLink
              href="/admin/dashboard/guide"
              title={navExpanded ? undefined : tNav('guide')}
              className={`flex min-h-10 items-center rounded-lg text-subtle hover:text-foreground hover:bg-surface-2 transition-colors ${
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
        </div>}

        {/* Footer — session info */}
        <div className={`border-t border-border flex-shrink-0 ${navExpanded ? 'px-3 py-3' : 'px-2 py-3'}`}>
          {session ? (
            <div className={`flex ${navExpanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'}`}>
              <GuardedLink
                href={sessionProfileHref}
                className={`flex items-center gap-2 min-w-0 flex-1 hover:text-foreground transition-colors ${navExpanded ? '' : 'justify-center'}`}
                aria-label={sessionProfileLabel}
                title={sessionProfileLabel}
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-danger-soft-foreground"
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
              className={`flex min-h-10 items-center gap-2 rounded-lg bg-[#5865F2] font-semibold text-white transition-colors hover:bg-[#4752c4] ${navExpanded ? 'justify-center px-3 py-2 text-xs' : 'justify-center p-2'}`}
            >
              <LogIn size={13} />
              {navExpanded && <span>{t('discordLogin')}</span>}
            </a>
          )}
        </div>
      </aside>

      <nav
        aria-label={t('primaryNavigation')}
        className={`safe-area-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pt-1 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:hidden${visualRefreshEnabled ? ' v3-navigation' : ''}`}
      >
        <div
          className="grid min-h-14"
          style={{ gridTemplateColumns: `repeat(${mobilePrimaryItems.length}, minmax(0, 1fr))` }}
        >
          {mobilePrimaryItems.map((item) => {
            const Icon = MOBILE_NAV_ICONS[item.area]
            const label = tNav(item.area)
            const active = item.active
            const badge = item.badge
            const content = (
              <>
                <span className="relative">
                  <Icon size={19} aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -right-3 -top-2 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-danger-foreground">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[10px] font-medium leading-tight">{label}</span>
              </>
            )

            return (
              <GuardedLink
                key={item.area}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                aria-label={t('areaDestination', {
                  area: label,
                  destination: item.destinationLabel,
                })}
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 transition-colors active:bg-surface-2 ${
                  active ? 'text-accent' : 'text-subtle'
                }`}
              >
                {content}
              </GuardedLink>
            )
          })}
        </div>
      </nav>
    </>
  )
}

interface ResolvedNavItem extends NavItem {
  label: string
  badge?: number
}

type IntentPrefetchLinkProps = ComponentProps<typeof GuardedLink>

// Secondary navigation can contain dozens of dynamic routes. Avoid fetching
// every visible RSC payload in the background; warm only the route the user
// points at or reaches by keyboard, preserving fast intent-driven navigation.
function IntentPrefetchLink({
  href,
  onPointerEnter,
  onFocus,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter()
  const prefetchedRef = useRef(false)
  const prefetch = () => {
    if (prefetchedRef.current || typeof href !== 'string' || !href.startsWith('/')) return
    prefetchedRef.current = true
    router.prefetch(href)
  }

  return (
    <GuardedLink
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        prefetch()
        onPointerEnter?.(event)
      }}
      onFocus={(event) => {
        prefetch()
        onFocus?.(event)
      }}
    />
  )
}

// Maps an admin nav href to its pending count for the sidebar badge. The
// The unified approvals entry shows the full queue size so the operator does
// not need to drill into sub-tabs to notice pending work.
function badgeCountFor(href: string, badges: AdminBadgeCounts | null): number {
  if (!badges) return 0
  if (href === '/admin/dashboard/approvals') {
    return badges.regear + badges.exchange + badges.donation + badges.shop + badges.memberTrade + badges.eventPayout + badges.craft
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
  contentId: string
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
    <IntentPrefetchLink
      href={href}
      title={expanded ? undefined : label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-10 items-center gap-3 rounded-lg transition-colors ${
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
    </IntentPrefetchLink>
  )
}

function NavGroup({
  title,
  items,
  pathname,
  expanded,
  collapsible,
  setCollapsible,
  contentId,
  sectionLabel,
  collapsedSections,
  onToggleSection,
}: NavGroupProps) {
  if (items.length === 0) return null
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
          aria-expanded={groupOpen}
          aria-controls={contentId}
          className="flex min-h-10 w-full items-center justify-between rounded-md px-2 text-[10px] font-semibold uppercase tracking-widest text-subtle transition-colors hover:bg-surface-2 hover:text-muted"
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
      <div id={contentId} hidden={!groupOpen} className="space-y-1">
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
                      aria-expanded={!sectionCollapsed}
                      aria-controls={`${contentId}-${bucket.section}`}
                      className="flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2 text-[11px] font-medium tracking-wide text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <span>{sectionLabel(bucket.section)}</span>
                      <ChevronDown
                        size={12}
                        className={`transition-transform text-subtle ${sectionCollapsed ? '-rotate-90' : ''}`}
                      />
                    </button>
                    <div
                      id={`${contentId}-${bucket.section}`}
                      hidden={sectionCollapsed}
                      className="space-y-1"
                    >
                      {bucket.items.map((item) => (
                        <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
                      ))}
                    </div>
                  </Fragment>
                )
              })
            : items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
              )))}
      </div>
    </div>
  )
}
