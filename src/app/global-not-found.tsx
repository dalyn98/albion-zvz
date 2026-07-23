import './globals.css'
import { headers } from 'next/headers'
import { getTranslations, getLocale } from 'next-intl/server'
import { Compass, ExternalLink, Home } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCanonicalRootDomain } from '@/lib/tenant-resolver'
import { pretendard } from './font'

// 어떤 layout 도 매칭되지 않은 URL (e.g. `/this-does-not-exist`) 진입 시 노출.
// RootLayout 의 `locked` 분기가 AppGate 를 강제로 띄우는 것을 우회하기 위해
// experimental.globalNotFound 플래그와 함께 사용한다. 이 파일은 자체 <html><body>
// 를 가져야 하고 globals.css/폰트도 직접 import.
//
// segment-level `notFound()` 호출에는 영향 없음 — 그 경로는 여전히
// `src/app/not-found.tsx` (또는 더 가까운 segment-level not-found.tsx) 가 처리.

export const metadata: Metadata = {
  metadataBase: new URL('https://albion-guildmanager.com'),
  title: '404 — Albion Guild Manager',
  description: 'Page not found',
  robots: { index: false, follow: false },
}

export default async function GlobalNotFound() {
  const [t, locale, hdrs] = await Promise.all([
    getTranslations('errors'),
    getLocale(),
    headers(),
  ])

  // tenant 서브도메인에서는 길드 홈과 공식 사이트를 모두 제공한다. 잘못된
  // 내부 북마크라면 길드 홈으로 복구하고, 길드 자체가 더 이상 유효하지 않다면
  // canonical 마케팅 홈으로 빠져나갈 수 있다.
  const canonical = getCanonicalRootDomain()
  const host = hdrs.get('host')?.toLowerCase() ?? ''
  const isTenantSubdomain =
    host.endsWith(`.${canonical}`) && host !== canonical && host !== `www.${canonical}`

  return (
    <html lang={locale} className={`h-full antialiased ${pretendard.variable}`}>
      <body className="min-h-full bg-[#0f1117] text-white">
        <main className="min-h-screen flex items-center justify-center px-4 py-16">
          <div className="max-w-md w-full bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Compass size={24} className="text-amber-300" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-white">{t('notFoundTitle')}</h1>
              <p className="text-sm text-gray-400">{t('notFoundDescription')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                <Home size={14} />
                {t('home')}
              </Link>
              {isTenantSubdomain && (
                <a
                  href={`https://${canonical}/`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/70 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-700"
                >
                  <ExternalLink size={14} />
                  {t('officialSite')}
                </a>
              )}
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
