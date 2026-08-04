import Link from 'next/link'
import {
  LayoutDashboard,
  Building2,
  Megaphone,
  ScrollText,
  ShieldAlert,
  Globe,
  ExternalLink,
  ImageIcon,
  Wrench,
  Users,
  TrendingUp,
  Scale,
  CalendarRange,
  Headphones,
} from 'lucide-react'
import { requireSuperAdmin } from '@/lib/super-admin'
import { getSuperAdminPath } from '@/lib/super-admin-path'

export const dynamic = 'force-dynamic'

interface NavItem {
  href: string
  label: string
  Icon: typeof LayoutDashboard
  external?: boolean
}

// 슈퍼어드민이 마케팅 랜딩을 빠르게 점검할 수 있도록 새 탭으로 띄우는 경로.
// /public/* 는 layout 의 isPublic 분기로 인해 어떤 호스트에서도 AppGate 우회 →
// 테넌트 서브도메인에 있어도 동일 도메인에서 그대로 열린다.
const PUBLIC_LANDING_HREF = '/public/landing'

function buildNav(basePath: string): NavItem[] {
  return [
    { href: basePath, label: '대시보드', Icon: LayoutDashboard },
    { href: `${basePath}/tenants`, label: '테넌트', Icon: Building2 },
    { href: `${basePath}/users`, label: '사용자', Icon: Users },
    { href: `${basePath}/account-merge`, label: '계정 병합', Icon: Users },
    { href: `${basePath}/ownership-disputes`, label: '길드 대표권 분쟁', Icon: Scale },
    { href: `${basePath}/zvz-seasons`, label: 'ZvZ 시즌', Icon: CalendarRange },
    { href: `${basePath}/support`, label: '공식 지원', Icon: Headphones },
    { href: `${basePath}/seo`, label: 'SEO 유입', Icon: TrendingUp },
    { href: `${basePath}/notices`, label: '시스템 공지', Icon: Megaphone },
    { href: `${basePath}/marketing-screenshots`, label: '마케팅 스크린샷', Icon: ImageIcon },
    { href: `${basePath}/diagnostics`, label: '진단/백필', Icon: Wrench },
    { href: `${basePath}/audit`, label: '감사 로그', Icon: ScrollText },
    { href: PUBLIC_LANDING_HREF, label: '공개 랜딩', Icon: Globe, external: true },
  ]
}

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin()
  const basePath = getSuperAdminPath()
  const nav = buildNav(basePath)

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-4 flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-rose-200 text-xs">
        <ShieldAlert size={14} className="flex-shrink-0" />
        <span>슈퍼어드민 영역 — 모든 테넌트 데이터에 접근할 수 있습니다.</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <nav className="bg-gray-900 border border-gray-700 rounded-2xl p-3 h-fit">
          <ul className="space-y-1">
            {nav.map(({ href, label, Icon, external }) => (
              <li key={href}>
                <Link
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Icon size={14} />
                  <span className="flex-1">{label}</span>
                  {external && <ExternalLink size={12} className="opacity-60" />}
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
