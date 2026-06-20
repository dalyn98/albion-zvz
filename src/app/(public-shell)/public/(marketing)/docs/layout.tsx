import type { Metadata } from 'next'
import { DEFAULT_LOCALE } from '@/i18n/locales'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { DOCS_NAV } from '@/lib/docs-nav'
import MarketingNav from '@/components/MarketingNav'
import DocsSidebar from '@/components/DocsSidebar'

export const revalidate = 3600

// Discord/Slack 임베드: docs 안의 어느 페이지를 공유해도 "사용 안내서" 컨텍스트
// 가 명확히 보이도록 OG 를 docs 전용으로 덮어쓴다. root layout 의 default OG
// 와 metadataBase/openGraph.images (opengraph-image.tsx) 는 그대로 상속.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('meta')
  const title = t('ogDocsTitle')
  const description = t('ogDocsDescription')
  return {
    title,
    description,
    openGraph: {
      type: 'article',
      siteName: t('ogSiteName'),
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('docsNav'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)

  const sections = DOCS_NAV.map((section) => ({
    label: t(section.sectionKey as 'sectionGettingStarted'),
    items: section.items.map((item) => ({
      href: item.slug ? `${paths.docs}/${item.slug}` : paths.docs,
      label: t(item.itemKey as 'intro'),
      subItems: item.subItems?.map((sub) => ({
        href: `${paths.docs}/${sub.slug}`,
        label: t(sub.itemKey as 'intro'),
      })),
    })),
  }))

  const showNonKoBanner = locale !== DEFAULT_LOCALE

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
