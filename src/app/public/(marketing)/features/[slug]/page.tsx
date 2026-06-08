import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Bot,
  Calendar,
  Check,
  Coins,
  HelpCircle,
  ShoppingBag,
  ShieldCheck,
  Swords,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MarketingNav from '@/components/MarketingNav'
import MarketingScreenshotCarousel from '@/components/MarketingScreenshotCarousel'
import { getMarketingPaths, resolveMarketingHref } from '@/lib/marketing-paths'
import { loadMarketingScreenshots } from '@/lib/marketing-screenshots'
import { getSession } from '@/lib/session'
import { isSuperAdminSession } from '@/lib/super-admin'
import {
  buildFeaturePageStructuredData,
  getCanonicalOrigin,
  serializeJsonLd,
} from '@/lib/seo-metadata'
import {
  FEATURE_PAGE_SLUGS,
  getSeoFeaturePage,
  type SeoFeatureIconKey,
} from '@/lib/seo-feature-pages'

export const dynamic = 'force-dynamic'

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

export function generateStaticParams(): Array<{ slug: string }> {
  return FEATURE_PAGE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ slug }, t] = await Promise.all([
    params,
    getTranslations('publicSeoFeatures'),
  ])
  const page = getSeoFeaturePage(slug)
  if (!page) {
    return {
      title: t('notFoundTitle'),
      robots: { index: false, follow: false },
    }
  }

  return {
    title: t(`${page.messageKey}MetaTitle`),
    description: t(`${page.messageKey}MetaDescription`),
    openGraph: {
      type: 'website',
      title: t(`${page.messageKey}MetaTitle`),
      description: t(`${page.messageKey}MetaDescription`),
      url: `${getCanonicalOrigin()}/features/${page.slug}`,
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

  const [t, tDocs, paths, screenshots, session] = await Promise.all([
    getTranslations('publicSeoFeatures'),
    getTranslations('docsNav'),
    getMarketingPaths(),
    loadMarketingScreenshots(),
    getSession(),
  ])
  const Icon = ICONS[page.icon]
  const isAdmin = isSuperAdminSession(session)
  const faqItems = [
    {
      question: t(`${page.messageKey}FaqQuestion`),
      answer: t(`${page.messageKey}FaqAnswer`),
    },
  ]
  const structuredData = buildFeaturePageStructuredData({
    title: t(`${page.messageKey}MetaTitle`),
    description: t(`${page.messageKey}MetaDescription`),
    pathname: `/features/${page.slug}`,
    keywords: page.keywords,
    faqItems,
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MarketingNav active="features" />
      <div className="bg-[#0b0d12] text-gray-100 min-h-screen">
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
                {page.keywords.map((keyword) => (
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
                  href={paths.demo}
                  className="inline-flex items-center justify-center rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-200 transition-colors"
                >
                  {t('primaryCta')}
                </Link>
                <Link
                  href={paths.docs}
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
              editable={isAdmin}
              slot={page.screenshotKey}
            />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <h2 className="text-base font-bold text-white">{t('problemTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                {t(`${page.messageKey}Problem`)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-5">
              <h2 className="text-base font-bold text-white">{t('outcomeTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-emerald-50/85">
                {t(`${page.messageKey}Outcome`)}
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">{t('howTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="rounded-xl border border-gray-800 bg-gray-900/60 p-4"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-200">
                    {n}
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-gray-200">
                    {t(`${page.messageKey}Step${n}`)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <h2 className="text-base font-bold text-white">{t('proofTitle')}</h2>
              <ul className="mt-4 space-y-2">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex items-start gap-2 text-sm text-gray-200">
                    <Check size={15} className="mt-0.5 flex-shrink-0 text-amber-300" />
                    <span>{t(`${page.messageKey}Proof${n}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-5">
              <h2 className="text-base font-bold text-white">{t('relatedDocsTitle')}</h2>
              <div className="mt-4 space-y-2">
                {page.relatedDocs.map((doc) => (
                  <Link
                    key={doc.href}
                    href={resolveMarketingHref(paths, doc.href)}
                    className="block rounded-lg border border-sky-300/20 px-3 py-2 text-sm text-sky-100 hover:bg-sky-300/10"
                  >
                    {tDocs(doc.labelKey as 'intro')}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
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
          </section>
        </main>
      </div>
    </>
  )
}
