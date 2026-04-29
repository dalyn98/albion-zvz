import { getLocale, getTranslations } from 'next-intl/server'
import { getMarketingPaths } from '@/lib/marketing-paths'
import { DOCS_NAV } from '@/lib/docs-nav'
import MarketingNav from '@/components/MarketingNav'
import DocsSidebar from '@/components/DocsSidebar'

export const dynamic = 'force-dynamic'

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const [paths, t, locale] = await Promise.all([
    getMarketingPaths(),
    getTranslations('docsNav'),
    getLocale(),
  ])

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
