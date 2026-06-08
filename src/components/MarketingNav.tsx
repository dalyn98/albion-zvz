import Link from 'next/link'
import { Home, LogIn } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getMarketingPaths } from '@/lib/marketing-paths'
import { getMarketingMyGuildHref } from '@/lib/last-guild'
import MarketingLanguageSwitcher from './MarketingLanguageSwitcher'
import MarketingNavMobileMenu from './MarketingNavMobileMenu'
import DiscordIcon from './DiscordIcon'

// 앱 운영자가 직접 관리하는 공식 커뮤니티 invite. 길드별 길드 디스코드와 다른
// "AlbionGuildManager 사용자/제보 채널" 이라 host 와 무관하게 동일.
const APP_DISCORD_INVITE_URL = 'https://discord.gg/pJ8EsybBjm'

type NavKey = 'home' | 'features' | 'pricing' | 'docs' | 'faq'

interface MarketingNavProps {
  active?: NavKey
}

export default async function MarketingNav({ active }: MarketingNavProps) {
  // 마케팅 페이지는 layout 의 PublicShell/AppShell 분기에서 빠져 children 만
  // 렌더되므로 (isMarketing 분기), 페이지 최상단 헤더는 이 nav 가 직접 책임진다.
  // tenant host 에서는 공식 사이트 링크가 canonical root 절대 URL 로 잡히고,
  // preview/localhost 에서는 로컬 검증 가능한 /public/* 로 fallback 된다.
  const [t, session, paths] = await Promise.all([
    getTranslations('publicNav'),
    getSession(),
    getMarketingPaths(),
  ])

  const myGuildHref = await getMarketingMyGuildHref(session)

  // features 는 /landing#features 앵커로 가서 기능 카드 섹션을 직접 보여주고,
  // pricing/docs/faq 는 별도 페이지로 분리해 공개 탐색 경로를 명확히 둔다.
  const navItems: Array<{ href: string; key: NavKey }> = [
    { href: paths.home, key: 'home' },
    { href: paths.features, key: 'features' },
    { href: paths.pricing, key: 'pricing' },
    { href: paths.docs, key: 'docs' },
    { href: paths.faq, key: 'faq' },
  ]
  const mobileMenuItems = navItems.map((item) => ({
    href: item.href,
    label: t(item.key),
    isActive: active === item.key,
  }))

  return (
    <nav className="border-b border-white/5 bg-[#0b0d12]/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* 모바일/태블릿(<md): 햄버거. 데스크탑(md+): 가로 링크 묶음. 공개 링크가
            늘어난 상태에서 sm 폭부터 가로 nav 를 보이면 언어 스위처/CTA 와 충돌한다. */}
        <MarketingNavMobileMenu
          items={mobileMenuItems}
          openLabel={t('openMenu')}
          closeLabel={t('closeMenu')}
        />
        <ul className="hidden md:flex items-center gap-1 text-sm">
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
          <a
            href={APP_DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('discord')}
            title={t('discord')}
            className="inline-flex items-center justify-center text-gray-300 hover:text-white bg-gray-800/60 hover:bg-[#5865F2] border border-gray-700 hover:border-[#5865F2] rounded-md w-8 h-8 transition-colors"
          >
            <DiscordIcon size={14} />
          </a>
          {myGuildHref ? (
            <a
              href={myGuildHref}
              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap"
            >
              <Home size={12} />
              {t('myGuild')}
            </a>
          ) : (
            !session && (
              <a
                href="/api/auth/discord/start?returnTo=/onboard"
                data-seo-event="cta_bot_install_click"
                data-seo-target="/api/auth/discord/start"
                className="inline-flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap"
              >
                <LogIn size={12} />
                {t('install')}
              </a>
            )
          )}
        </div>
      </div>
    </nav>
  )
}
