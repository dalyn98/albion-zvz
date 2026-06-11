import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BarChart3,
  Bot,
  Calendar,
  Coins,
  ShoppingBag,
  ShieldCheck,
  Swords,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingTranslator } from '@/lib/marketing-static-intl'
import {
  buildSeoFeatureLanguageAlternates,
  getCanonicalOrigin,
  getCanonicalUrlForPathname,
} from '@/lib/seo-metadata'
import {
  getSeoFeaturePages,
  type SeoFeatureIconKey,
} from '@/lib/seo-feature-pages'

export const revalidate = 3600

const ICONS: Record<SeoFeatureIconKey, typeof Bot> = {
  bot: Bot,
  regear: ShieldCheck,
  killboard: Swords,
  events: Calendar,
  shop: ShoppingBag,
  stats: BarChart3,
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getMarketingTranslator('publicSeoFeatures')
  const pathname = '/features'
  const canonicalUrl = getCanonicalUrlForPathname(pathname) ?? `${getCanonicalOrigin()}/features`
  const languages = buildSeoFeatureLanguageAlternates(pathname)
  return {
    title: t('indexMetaTitle'),
    description: t('indexMetaDescription'),
    alternates: {
      canonical: canonicalUrl,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      type: 'website',
      title: t('indexMetaTitle'),
      description: t('indexMetaDescription'),
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('indexMetaTitle'),
      description: t('indexMetaDescription'),
    },
  }
}

export default async function PublicFeaturesPage() {
  const t = getMarketingTranslator('publicSeoFeatures')
  const paths = getMarketingPathsForEnvironment()
  const pages = getSeoFeaturePages()

  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="features" />
      <div className="bg-[#0b0d12] text-gray-100 min-h-screen">
        <main className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 space-y-12">
          <section className="space-y-5 max-w-3xl">
            <p className="text-xs sm:text-sm uppercase tracking-[0.22em] text-amber-300/80">
              {t('indexEyebrow')}
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight text-white">
              {t('indexHeading')}
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              {t('indexLead')}
            </p>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pages.map((page) => {
              const Icon = ICONS[page.icon]
              const href = resolveMarketingHref(paths, `/features/${page.slug}`)
              return (
                <Link
                  key={page.slug}
                  href={href}
                  data-seo-event="feature_card_click"
                  data-seo-target={page.slug}
                  className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 transition-colors hover:border-amber-300/60 hover:bg-gray-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      <Icon size={20} />
                    </span>
                    <p className="text-xs uppercase tracking-[0.18em] text-amber-200/70">
                      {t(`${page.messageKey}Eyebrow`)}
                    </p>
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-white leading-snug group-hover:text-amber-100">
                    {t(`${page.messageKey}Heading`)}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">
                    {t(`${page.messageKey}Lead`)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {page.keywords.slice(0, 3).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-gray-700 px-2 py-1 text-[11px] text-gray-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </Link>
              )
            })}
          </section>

          <section className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-5 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sky-200">
                  <Coins size={18} />
                  <h2 className="text-base font-bold text-white">{t('indexDocsTitle')}</h2>
                </div>
                <p className="mt-2 text-sm text-sky-100/80 leading-relaxed">
                  {t('indexDocsBody')}
                </p>
              </div>
              <Link
                href={paths.docs}
                data-seo-event="cta_docs_click"
                data-seo-target="/docs"
                className="inline-flex items-center justify-center rounded-lg bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-200 transition-colors"
              >
                {t('indexDocsCta')}
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
