import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Bot,
  Calendar,
  Check,
  HelpCircle,
  ShoppingBag,
  ShieldCheck,
  Swords,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import MarketingScreenshotCarousel from '@/components/MarketingScreenshotCarousel'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { loadMarketingScreenshots } from '@/lib/marketing-screenshots'
import {
  buildFeaturePageStructuredData,
  buildSeoFeatureLanguageAlternates,
  getCanonicalOrigin,
  getCanonicalUrlForPathname,
  serializeJsonLd,
} from '@/lib/seo-metadata'
import {
  FEATURE_PAGE_SLUGS,
  getSeoFeaturePage,
  type SeoFeaturePageSlug,
  type SeoFeatureIconKey,
} from '@/lib/seo-feature-pages'

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
}

const ICONS: Record<SeoFeatureIconKey, typeof Bot> = {
  bot: Bot,
  regear: ShieldCheck,
  killboard: Swords,
  events: Calendar,
  shop: ShoppingBag,
  stats: BarChart3,
}

type DemoScenario = 'events' | 'stats' | 'regear'

function demoScenarioForFeature(slug: SeoFeaturePageSlug): DemoScenario | null {
  if (slug === 'guild-events') return 'events'
  if (slug === 'auto-regear') return 'regear'
  if (slug === 'zvz-killboard' || slug === 'guild-stats') return 'stats'
  return null
}

function appendDemoScenario(href: string, scenario: DemoScenario | null): string {
  if (!scenario) return href
  if (href.startsWith('http://') || href.startsWith('https://')) {
    const url = new URL(href)
    url.searchParams.set('scenario', scenario)
    return url.toString()
  }
  return `${href}${href.includes('?') ? '&' : '?'}scenario=${scenario}`
}

function demoSeoTargetForFeature(slug: SeoFeaturePageSlug): string {
  const scenario = demoScenarioForFeature(slug)
  return scenario ? `/demo?scenario=${scenario}` : '/demo'
}

export function generateStaticParams(): Array<{ slug: string }> {
  return FEATURE_PAGE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, headerStore] = await Promise.all([
    getMarketingTranslator('publicSeoFeatures'),
    headers(),
  ])
  const page = getSeoFeaturePage(slug)
  if (!page) {
    return {
      title: t('notFoundTitle'),
      robots: { index: false, follow: false },
    }
  }
  const fallbackPathname = `/features/${page.slug}`
  const requestPathname = headerStore.get('x-pathname') ?? fallbackPathname
  const canonicalUrl =
    getCanonicalUrlForPathname(requestPathname) ?? `${getCanonicalOrigin()}${fallbackPathname}`
  const languages = buildSeoFeatureLanguageAlternates(requestPathname)

  return {
    title: t(`${page.messageKey}MetaTitle`),
    description: t(`${page.messageKey}MetaDescription`),
    alternates: {
      canonical: canonicalUrl,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      type: 'website',
      title: t(`${page.messageKey}MetaTitle`),
      description: t(`${page.messageKey}MetaDescription`),
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: t(`${page.messageKey}MetaTitle`),
      description: t(`${page.messageKey}MetaDescription`),
    },
  }
}

export default async function PublicFeatureDetailPage({ params }: PageProps) {
  const { slug } = await params
  const page = getSeoFeaturePage(slug)
  if (!page) notFound()

  const [screenshots, locale, t, tDocs] = await Promise.all([
    loadMarketingScreenshots(),
    getMarketingLocale(),
    getMarketingTranslator('publicSeoFeatures'),
    getMarketingTranslator('docsNav'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const Icon = ICONS[page.icon]
  const isAdmin = false
  const keywords = page.keywordMessageKeys.map((key) => t(key))
  const faqItems = [
    {
      question: t(`${page.messageKey}FaqQuestion`),
      answer: t(`${page.messageKey}FaqAnswer`),
    },
  ]
  const canonicalPathname = `/features/${page.slug}`
  const structuredData = buildFeaturePageStructuredData({
    title: t(`${page.messageKey}MetaTitle`),
    description: t(`${page.messageKey}MetaDescription`),
    pathname: canonicalPathname,
    keywords,
    faqItems,
  })
  const demoScenario = demoScenarioForFeature(page.slug)
  const demoHref = appendDemoScenario(paths.demo, demoScenario)
  const demoSeoTarget = demoSeoTargetForFeature(page.slug)

  return (
    <>
      <MarketingAttributionTracker />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MarketingNav active="features" />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-14 space-y-12">
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-12 items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-amber-300">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/25">
                  <Icon size={22} />
                </span>
                <p className="text-xs sm:text-sm uppercase tracking-[0.22em]">
                  {t(`${page.messageKey}Eyebrow`)}
                </p>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold leading-tight text-white">
                {t(`${page.messageKey}Heading`)}
              </h1>
              <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
                {t(`${page.messageKey}Lead`)}
              </p>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-gray-700 bg-gray-900/70 px-2.5 py-1 text-[11px] text-gray-300"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Link
                  href={demoHref}
                  data-seo-event="cta_demo_click"
                  data-seo-target={demoSeoTarget}
                  className="inline-flex items-center justify-center rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-200 transition-colors"
                >
                  {t('primaryCta')}
                </Link>
                <Link
                  href={paths.docs}
                  data-seo-event="cta_docs_click"
                  data-seo-target="/docs"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900/70 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
                >
                  {t('secondaryCta')}
                </Link>
              </div>
            </div>

            <MarketingScreenshotCarousel
              images={screenshots[page.screenshotKey]}
              fallbackLabel={t(`${page.messageKey}ScreenshotLabel`)}
              aspect="4/3"
              priorityFirstImage
              editable={isAdmin}
              slot={page.screenshotKey}
            />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard>
              <h2 className="text-base font-bold text-foreground">{t('problemTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                {t(`${page.messageKey}Problem`)}
              </p>
            </SectionCard>
            <SectionCard tone="success" className="border-success/30 bg-success-soft">
              <h2 className="text-base font-bold text-foreground">{t('outcomeTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-emerald-50/85">
                {t(`${page.messageKey}Outcome`)}
              </p>
            </SectionCard>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">{t('howTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[1, 2, 3].map((n) => (
                <SectionCard key={n} className="p-4 sm:p-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-200">
                    {n}
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-gray-200">
                    {t(`${page.messageKey}Step${n}`)}
                  </p>
                </SectionCard>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <SectionCard tone="accent">
              <h2 className="text-base font-bold text-white">{t('proofTitle')}</h2>
              <ul className="mt-4 space-y-2">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex items-start gap-2 text-sm text-gray-200">
                    <Check size={15} className="mt-0.5 flex-shrink-0 text-amber-300" />
                    <span>{t(`${page.messageKey}Proof${n}`)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard tone="info" className="border-info/30 bg-info-soft">
              <h2 className="text-base font-bold text-white">{t('relatedDocsTitle')}</h2>
              <div className="mt-4 space-y-2">
                {page.relatedDocs.map((doc) => (
                  <Link
                    key={doc.href}
                    href={resolveMarketingHref(paths, doc.href)}
                    data-seo-event="cta_docs_click"
                    data-seo-target={doc.href}
                    className="block rounded-lg border border-sky-300/20 px-3 py-2 text-sm text-sky-100 hover:bg-sky-300/10"
                  >
                    {tDocs(doc.labelKey as 'intro')}
                  </Link>
                ))}
              </div>
            </SectionCard>
          </section>

          <SectionCard>
            <div className="flex items-start gap-3">
              <HelpCircle size={20} className="mt-0.5 text-amber-300 flex-shrink-0" />
              <div>
                <h2 className="text-base font-bold text-white">
                  {faqItems[0].question}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  {faqItems[0].answer}
                </p>
              </div>
            </div>
          </SectionCard>
        </main>
      </div>
    </>
  )
}
