import Link from 'next/link'
import { LayoutDashboard, Building2, Megaphone, ScrollText, ShieldAlert } from 'lucide-react'
import { requireSuperAdmin } from '@/lib/super-admin'

export const dynamic = 'force-dynamic'

interface NavItem {
  href: string
  label: string
  Icon: typeof LayoutDashboard
}

const NAV: NavItem[] = [
  { href: '/super-admin', label: '대시보드', Icon: LayoutDashboard },
  { href: '/super-admin/tenants', label: '테넌트', Icon: Building2 },
  { href: '/super-admin/notices', label: '시스템 공지', Icon: Megaphone },
  { href: '/super-admin/audit', label: '감사 로그', Icon: ScrollText },
]

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin()

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-4 flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-rose-200 text-xs">
        <ShieldAlert size={14} className="flex-shrink-0" />
        <span>슈퍼어드민 영역 — 모든 테넌트 데이터에 접근할 수 있습니다.</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <nav className="bg-gray-900 border border-gray-700 rounded-2xl p-3 h-fit">
          <ul className="space-y-1">
            {NAV.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Icon size={14} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>{children}</div>
      </div>
    </div>
  )
}
