import Link from 'next/link'
import { headers } from 'next/headers'
import { LogIn } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import MarketingLanguageSwitcher from './MarketingLanguageSwitcher'

// canonical 도메인에서 proxy 가 /features, /pricing, /faq 를 /public/* 로
// rewrite 하므로 nav href 는 깔끔한 canonical path 를 그대로 쓴다. URL bar 와
// active 상태가 쉽게 일치한다.
const NAV_ITEMS = [
  { href: '/', key: 'home' as const },
  { href: '/features', key: 'features' as const },
  { href: '/pricing', key: 'pricing' as const },
  { href: '/faq', key: 'faq' as const },
] as const

type NavKey = (typeof NAV_ITEMS)[number]['key']

interface MarketingNavProps {
  active?: NavKey
}

export default async function MarketingNav({ active }: MarketingNavProps) {
  const [t, session, headersList] = await Promise.all([
    getTranslations('publicNav'),
    getSession(),
    headers(),
  ])
  // 마케팅 페이지는 layout 의 PublicShell/AppShell 분기에서 빠져 children 만
  // 렌더되므로 (isMarketing 분기), 페이지 최상단 헤더는 이 nav 가 직접 책임진다.
  // 로그인 세션을 노출 여부 판단(install CTA hide)에 쓰기 위해 받아온다.
  void headersList
  return (
    <nav className="border-b border-white/5 bg-[#0b0d12]/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <ul className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
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
