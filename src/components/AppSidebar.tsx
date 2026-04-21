'use client'

import { useEffect, useState } from 'react'
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
  Archive,
  ShoppingBag,
} from 'lucide-react'
import type { SessionPayload } from '@/lib/session'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import LanguageSwitcher from './LanguageSwitcher'

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
}

const MEMBER_NAV: NavItem[] = [
  { href: '/', labelKey: 'events', icon: CalendarDays },
  { href: '/regear', labelKey: 'regearRequest', icon: ShieldCheck, memberOnly: true },
  { href: '/shop', labelKey: 'shop', icon: ShoppingBag },
  { href: '/members', labelKey: 'members', icon: Users },
  { href: '/archive', labelKey: 'archive', icon: Archive },
  { href: '/me', labelKey: 'myWallet', icon: Wallet, exact: true, memberOnly: true },
  { href: '/me/settings', labelKey: 'mySettings', icon: Settings },
]

const ADMIN_NAV: NavItem[] = [
  // `/admin/dashboard`는 다른 모든 관리자 라우트의 부모이기도 해서,
  // exact 매칭이 없으면 하위 페이지에 있을 때도 "이벤트 관리"가 계속 하이라이트됨.
  { href: '/admin/dashboard', labelKey: 'eventAdmin', icon: CalendarDays, exact: true },
  { href: '/admin/dashboard/approvals', labelKey: 'approvals', icon: ShieldCheck },
  { href: '/admin/dashboard/shop', labelKey: 'shopAdmin', icon: ShoppingBag },
  { href: '/admin/dashboard/settings', labelKey: 'settings', icon: Settings },
]

const STORAGE_KEY = 'app.sidebar.open'
const MEMBER_GROUP_KEY = 'app.sidebar.memberOpen'
const ADMIN_GROUP_KEY = 'app.sidebar.adminOpen'

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
}

export default function AppSidebar({ session, adminBadges }: AppSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  // Default collapsed on mobile, expanded on desktop. We hydrate from
  // localStorage after mount so the first paint matches the viewport.
  const [open, setOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const memberStored = window.localStorage.getItem(MEMBER_GROUP_KEY)
    const adminStored = window.localStorage.getItem(ADMIN_GROUP_KEY)
    const wideScreen = window.matchMedia('(min-width: 1024px)').matches
    setOpen(stored === null ? wideScreen : stored === 'true')
    if (memberStored !== null) setMemberOpen(memberStored === 'true')
    if (adminStored !== null) setAdminOpen(adminStored === 'true')
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
    // Auto-close the drawer on route change so taps on mobile feel responsive.
    setMobileDrawer(false)
  }, [pathname])

  const loginHref = `/api/auth/discord/start?returnTo=${encodeURIComponent(pathname || '/')}`
  const url = session ? avatarUrl(session.discordId, session.avatar) : null

  return (
    <>
      {/* Mobile top bar — only shown on <lg. Hamburger opens drawer. */}
      <div className="lg:hidden flex items-center justify-between border-b border-white/5 px-4 py-3 bg-[#0b0d12]/90 backdrop-blur-md sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setMobileDrawer(true)}
          aria-label={t('openMenu')}
          className="p-1.5 text-gray-300 hover:text-white"
        >
          <Menu size={20} />
        </button>
        <Link href="/" className="text-amber-400 text-base font-bold">⚔ Menhera</Link>
        {session ? (
          <Link href="/me/profile" aria-label={t('myInfo')} className="flex items-center">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <UserCircle2 size={24} className="text-gray-400" />
            )}
          </Link>
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
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-dvh lg:h-screen flex-shrink-0 border-r border-white/5 bg-[#0a0c11]/95 backdrop-blur-xl transition-[transform,width] duration-200 ease-out ${
          open ? 'w-64' : 'w-[64px]'
        } lg:w-auto ${open ? 'lg:w-64' : 'lg:w-[64px]'} flex flex-col overflow-hidden`}
      >
        {/* Brand + collapse toggle */}
        <div className={`flex items-center ${open ? 'justify-between px-4' : 'justify-center'} h-14 border-b border-white/5 flex-shrink-0`}>
          {open && (
            <Link href="/" className="text-amber-400 font-bold text-[15px] tracking-tight flex items-center gap-2 truncate">
              ⚔ <span>Menhera</span>
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
            items={MEMBER_NAV
              .filter((i) => !i.memberOnly || session?.isMember)
              .map((i) => ({ ...i, label: tNav(i.labelKey) }))}
            pathname={pathname || '/'}
            expanded={open}
            collapsible={memberOpen}
            setCollapsible={setMemberOpen}
          />
          {session?.isAdmin && (
            <NavGroup
              title={t('adminGroup')}
              items={ADMIN_NAV.map((i) => ({
                ...i,
                label: tNav(i.labelKey),
                badge: badgeCountFor(i.href, adminBadges),
              }))}
              pathname={pathname || '/'}
              expanded={open}
              collapsible={adminOpen}
              setCollapsible={setAdminOpen}
            />
          )}
        </nav>

        {/* Language switcher — above user info */}
        <div className={`border-t border-white/5 flex-shrink-0 ${open ? 'px-3 py-2' : 'px-2 py-2'}`}>
          <LanguageSwitcher expanded={open} />
        </div>

        {/* Footer — session info */}
        <div className={`border-t border-white/5 flex-shrink-0 ${open ? 'px-3 py-3' : 'px-2 py-3'}`}>
          {session ? (
            <div className={`flex ${open ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'}`}>
              <Link
                href="/me/profile"
                className={`flex items-center gap-2 min-w-0 flex-1 hover:text-white ${open ? '' : 'justify-center'}`}
                aria-label={t('myInfo')}
                title={t('myInfo')}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                ) : (
                  <UserCircle2 size={24} className="text-gray-400 flex-shrink-0" />
                )}
                {open && (
                  <span className="text-gray-200 text-xs font-medium truncate">{session.username}</span>
                )}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className={`flex items-center gap-1 text-gray-500 hover:text-red-400 p-1.5 ${open ? '' : ''}`}
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
              className={`flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold rounded-lg transition-colors ${open ? 'text-xs px-3 py-2 justify-center' : 'justify-center p-2'}`}
            >
              <LogIn size={13} />
              {open && <span>{t('discordLogin')}</span>}
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
    return badges.regear + badges.exchange + badges.donation + badges.shop
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
}

function NavGroup({ title, items, pathname, expanded, collapsible, setCollapsible }: NavGroupProps) {
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
            className={`transition-transform ${collapsible ? '' : '-rotate-90'}`}
          />
        </button>
      ) : (
        <div className="border-t border-gray-800 mx-2 my-1" aria-label={title} />
      )}
      {(collapsible || !expanded) &&
        items.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = isActivePath(pathname, href, exact)
          const hasBadge = typeof badge === 'number' && badge > 0
          return (
            <Link
              key={href}
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
        })}
    </div>
  )
}
