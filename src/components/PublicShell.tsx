import { headers } from 'next/headers'
import { LogIn } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { classifyHost } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { getSession } from '@/lib/session'
import LanguageSwitcher from './LanguageSwitcher'
import { GuardedLink } from './UnsavedChangesProvider'

const DEFAULT_BRAND_NAME = 'Albion ZvZ'

// Minimal shell for visitors — shows the brand, a language switcher, and a
// Discord login CTA only when there's no session. 온보딩 위저드(/onboard/*)는
// 로그인 상태에서도 PublicShell 을 쓰는데(사이드바가 아직 어색하므로), 이때
// "로그인" CTA 가 보이면 사용자가 미로그인 상태로 오인하므로 세션이 있으면
// 버튼을 숨긴다. 세션 사용자에게는 로그아웃이 필요하면 사이드바/AppGate 가
// 처리하므로 여기서는 노출하지 않는다.
// 브랜드는 host 의 slug 첫 하이픈 앞부분(예: jelda-pl9c → "Jelda") 을 사용해
// 멘헤라가 아닌 다른 길드 페이지에서도 자기 길드 이름이 노출되도록.
export default async function PublicShell({ children }: { children: React.ReactNode }) {
  const [t, headersList, session] = await Promise.all([
    getTranslations('sidebar'),
    headers(),
    getSession(),
  ])
  const classification = classifyHost(headersList.get('host'))
  let brandName = DEFAULT_BRAND_NAME
  if (classification.kind === 'tenant') {
    const derived = displayNameFromSlug(classification.slug)
    if (derived.length > 0) brandName = derived
  }
  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="border-b border-white/5 bg-[#0b0d12]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <GuardedLink
            href="/"
            className="text-amber-400 text-base font-bold flex items-center gap-2"
          >
            <span>⚔</span>
            <span>{brandName}</span>
          </GuardedLink>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {!session && (
              <a
                href="/api/auth/discord/start?returnTo=/"
                className="flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              >
                <LogIn size={12} />
                {t('login')}
              </a>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}
