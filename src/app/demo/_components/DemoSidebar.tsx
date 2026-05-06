'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  ShieldAlert,
  Users,
  Swords,
  Hammer,
  Store,
  Archive,
  Settings,
  Lock,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

type DemoNavItem = {
  href: string
  labelKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  active: boolean
}

type DemoNavSection = {
  labelKey: string
  items: DemoNavItem[]
}

const SECTIONS: DemoNavSection[] = [
  {
    labelKey: 'sidebar.section.activity',
    items: [
      { href: '/demo', labelKey: 'sidebar.nav.dashboard', icon: LayoutDashboard, active: true },
      { href: '/demo/events', labelKey: 'sidebar.nav.events', icon: Calendar, active: true },
      { href: '/demo/battles', labelKey: 'sidebar.nav.battles', icon: Swords, active: false },
    ],
  },
  {
    labelKey: 'sidebar.section.regear',
    items: [
      { href: '/demo/regear', labelKey: 'sidebar.nav.regear', icon: ShieldAlert, active: true },
      { href: '/demo/craft', labelKey: 'sidebar.nav.craft', icon: Hammer, active: false },
    ],
  },
  {
    labelKey: 'sidebar.section.community',
    items: [
      { href: '/demo/members', labelKey: 'sidebar.nav.members', icon: Users, active: true },
      { href: '/demo/shop', labelKey: 'sidebar.nav.shop', icon: Store, active: false },
    ],
  },
  {
    labelKey: 'sidebar.section.ops',
    items: [
      { href: '/demo/archive', labelKey: 'sidebar.nav.archive', icon: Archive, active: false },
      { href: '/demo/settings', labelKey: 'sidebar.nav.settings', icon: Settings, active: false },
    ],
  },
]

export function DemoSidebar() {
  const t = useTranslations('demo')
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/demo') return pathname === '/demo'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-gray-950 border-r border-gray-800 sticky top-9 h-[calc(100vh-2.25rem)] overflow-y-auto">
      <div className="px-4 py-4 border-b border-gray-800">
        <div className="text-xs text-gray-500 uppercase tracking-wider">{t('brand.label')}</div>
        <div className="text-base font-bold text-white mt-0.5">{t('brand.name')}</div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.labelKey}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-2 mb-1.5">
              {t(section.labelKey)}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                if (!item.active) {
                  return (
                    <li key={item.href}>
                      <span
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-gray-600 cursor-not-allowed"
                        title={t('sidebar.inactiveTooltip')}
                      >
                        <Icon size={14} className="shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                        <Lock size={10} className="ml-auto shrink-0" />
                      </span>
                    </li>
                  )
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                        active
                          ? 'bg-amber-500/15 text-amber-300 font-semibold'
                          : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
                      }`}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-800 text-[10px] text-gray-500 leading-relaxed">
        {t('sidebar.footer')}
      </div>
    </aside>
  )
}

export function DemoSidebarMobile() {
  const t = useTranslations('demo')
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/demo') return pathname === '/demo'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const items = SECTIONS.flatMap((s) => s.items).filter((i) => i.active)

  return (
    <div className="lg:hidden bg-gray-950 border-b border-gray-800 px-4 py-2 overflow-x-auto">
      <div className="flex gap-1.5 min-w-max">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-gray-900 text-gray-300 border border-gray-700'
              }`}
            >
              <Icon size={12} />
              {t(item.labelKey)}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
