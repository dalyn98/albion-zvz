import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getMarketingPaths } from '@/lib/marketing-paths'
import MarketingLanguageSwitcher from './MarketingLanguageSwitcher'

type NavKey = 'home' | 'docs'

interface MarketingNavProps {
  active?: NavKey
}

export default async function MarketingNav({ active }: MarketingNavProps) {
  // 마케팅 페이지는 layout 의 PublicShell/AppShell 분기에서 빠져 children 만
  // 렌더되므로 (isMarketing 분기), 페이지 최상단 헤더는 이 nav 가 직접 책임진다.
  // canonical 호스트 외(테넌트 서브도메인/프리뷰/로컬) 에서는 proxy rewrite 가
  // 안 걸리므로 paths 가 자동으로 /public/* 로 fallback 된다.
  const [t, session, paths] = await Promise.all([
    getTranslations('publicNav'),
    getSession(),
    getMarketingPaths(),
  ])
  const navItems: Array<{ href: string; key: NavKey }> = [
    { href: paths.home, key: 'home' },
    { href: paths.docs, key: 'docs' },
  ]
  return (
    <nav className="border-b border-white/5 bg-[#0b0d12]/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <ul className="flex items-center gap-1 text-sm">
          {navItems.map((item) => {
            const isActive = active === item.key
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-200 font-semibold'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                  }`}
                >
                  {t(item.key)}
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-2">
          <MarketingLanguageSwitcher />
          {!session && (
            <a
              href="/api/auth/discord/start?returnTo=/onboard"
              className="inline-flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-3 py-1.5 rounded-md"
            >
              <LogIn size={12} />
              {t('install')}
            </a>
          )}
        </div>
      </div>
    </nav>
  )
}
