import { getLocale, getTranslations } from 'next-intl/server'
import { getMarketingPaths } from '@/lib/marketing-paths'
import { DOCS_NAV } from '@/lib/docs-nav'
import MarketingNav from '@/components/MarketingNav'
import DocsSidebar from '@/components/DocsSidebar'

// docs 라우트는 동적 — force-static 금지 (AGENTS.md 규칙 #2). proxy 가 매 요청
// 마다 x-pathname 을 세팅해야 root layout 의 isMarketing 분기가 정확히 동작한다.
export const dynamic = 'force-dynamic'

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const [paths, t, locale] = await Promise.all([
    getMarketingPaths(),
    getTranslations('docsNav'),
    getLocale(),
  ])
  // sidebar 데이터는 server 에서 host-aware path + i18n 라벨로 미리 풀어 client
  // 컴포넌트에 prop 으로 전달 (t() 함수 자체를 client 에 넘기지 않는 컨벤션).
  const sections = DOCS_NAV.map((section) => ({
    label: t(section.sectionKey as 'sectionGettingStarted'),
    items: section.items.map((item) => ({
      href: item.slug ? `${paths.docs}/${item.slug}` : paths.docs,
      label: t(item.itemKey as 'intro'),
    })),
  }))
  // 본문은 ko 우선. 다른 locale 일 때 본문 위에 한 번 안내 배너 — 사용자가
  // ja/en 으로 보다가 한국어 본문이 나와 당황하지 않도록.
  const showNonKoBanner = locale !== 'ko'

  return (
    <>
      <MarketingNav active="docs" />
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
          <div className="sm:w-56 sm:flex-shrink-0">
            <DocsSidebar sections={sections} mobileMenuLabel={t('mobileMenuLabel')} />
          </div>
          <article className="flex-1 min-w-0 sm:max-w-3xl">
            {showNonKoBanner && (
              <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                <p className="text-amber-200 text-sm font-bold">
                  {t('nonKoBannerTitle')}
                </p>
                <p className="text-amber-100/80 text-xs mt-1 leading-relaxed">
                  {t('nonKoBannerBody')}
                </p>
              </div>
            )}
            {children}
          </article>
        </div>
      </div>
    </>
  )
}
