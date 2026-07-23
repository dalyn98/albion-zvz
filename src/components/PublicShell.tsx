import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { classifyHost } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import { resolveTenantBySlug } from '@/lib/tenant-resolver'
import LanguageSwitcher from './LanguageSwitcher'
import { GuardedLink } from './UnsavedChangesProvider'
import UxTelemetryTracker from './UxTelemetryTracker'
import CurrentPageLoginLink from './CurrentPageLoginLink'

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
  let uxRefreshEnabled = false
  if (classification.kind === 'tenant') {
    const derived = displayNameFromSlug(classification.slug)
    if (derived.length > 0) brandName = derived
    const tenant = await resolveTenantBySlug(classification.slug)
    if (tenant) {
      uxRefreshEnabled = (
        await getAppSetting('ux_refresh_v2_enabled', 'false', tenant.tenantId)
      ) === 'true'
    }
  }
  return (
    <div className={`flex min-h-screen w-full flex-col${uxRefreshEnabled ? ' ux-refresh-v2' : ''}`}>
      <UxTelemetryTracker enabled={uxRefreshEnabled && Boolean(session)} />
      <header className="border-b border-white/5 bg-[#0b0d12]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <GuardedLink
            href="/"
            className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-base font-bold text-amber-400"
          >
            <span>⚔</span>
            <span>{brandName}</span>
          </GuardedLink>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {!session && <CurrentPageLoginLink label={t('login')} />}
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}
