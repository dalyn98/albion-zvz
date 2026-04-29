'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Menu } from 'lucide-react'

interface SidebarItem {
  href: string
  label: string
}

interface SidebarSection {
  label: string
  items: SidebarItem[]
}

interface Props {
  sections: SidebarSection[]
  // i18n string for the mobile collapsed-state toggle. 서버에서 미리 풀어 prop
  // 으로 받음 — RSC → client 에 t 함수 prop 전달 금지 컨벤션.
  mobileMenuLabel: string
}

// docs 자체 sidebar. 데스크탑은 좌측 고정, 모바일은 위쪽 토글로 접힘.
// active 표시는 client 의 usePathname 으로 정확히 매칭 — server-side x-pathname
// 만으로는 client side navigation 이후 active 가 갱신되지 않는다.
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
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-200 font-semibold'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                      }`}
                    >
                      {item.label}
                    </Link>
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
