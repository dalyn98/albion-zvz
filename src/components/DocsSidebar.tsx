'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Menu } from 'lucide-react'

interface SidebarSubItem {
  href: string
  label: string
}

interface SidebarItem {
  href: string
  label: string
  subItems?: SidebarSubItem[]
}

interface SidebarSection {
  label: string
  items: SidebarItem[]
}

interface Props {
  sections: SidebarSection[]
  mobileMenuLabel: string
}

function isItemActive(pathname: string, item: SidebarItem): boolean {
  if (pathname === item.href) return true
  if (item.subItems?.some((sub) => sub.href === pathname)) return true
  return pathname.startsWith(`${item.href}/`)
}

export default function DocsSidebar({ sections, mobileMenuLabel }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="sm:hidden w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
        aria-expanded={mobileOpen}
      >
        <span className="flex items-center gap-2">
          <Menu size={14} className="text-amber-300" />
          {mobileMenuLabel}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <nav
        className={`${mobileOpen ? 'block' : 'hidden'} sm:block sm:sticky sm:top-4 space-y-5`}
      >
        {sections.map((section) => (
          <div key={section.label} className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href
                const hasActiveSub = isItemActive(pathname, item) && !isActive
                const showSubItems = item.subItems && (isActive || hasActiveSub)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-200 font-semibold'
                          : hasActiveSub
                          ? 'text-amber-200 font-semibold'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                      }`}
                    >
                      {item.label}
                    </Link>
                    {showSubItems && item.subItems && (
                      <ul className="mt-0.5 ml-3 border-l border-gray-800 pl-2 space-y-0.5">
                        {item.subItems.map((sub) => {
                          const subActive = pathname === sub.href
                          return (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                onClick={() => setMobileOpen(false)}
                                className={`block px-3 py-1 rounded-md text-xs transition-colors ${
                                  subActive
                                    ? 'bg-amber-500/15 text-amber-200 font-semibold'
                                    : 'text-gray-500 hover:text-white hover:bg-gray-800/60'
                                }`}
                              >
                                {sub.label}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
