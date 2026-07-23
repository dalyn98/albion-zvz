import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BarChart3,
  Bot,
  Calendar,
  Coins,
  PlayCircle,
  ShoppingBag,
  ShieldCheck,
  Swords,
  Zap,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
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
  const t = await getMarketingTranslator('publicSeoFeatures')
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
  const [locale, t, tNav] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicSeoFeatures'),
    getMarketingTranslator('publicNav'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const pages = getSeoFeaturePages()

  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="features" />
      <div className="min-h-screen bg-background text-foreground">
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
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Link
                href={paths.demo}
                data-seo-event="cta_demo_click"
                data-seo-target="/demo"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200"
              >
                <PlayCircle size={16} />
                {t('primaryCta')}
              </Link>
              <a
                href="/login?returnTo=%2Fonboard"
                data-seo-event="cta_bot_install_click"
                data-seo-target="/login"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
              >
                <Zap size={16} />
                {tNav('install')}
              </a>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pages.map((page) => {
              const Icon = ICONS[page.icon]
              const href = resolveMarketingHref(paths, `/features/${page.slug}`)
              const keywords = page.keywordMessageKeys.map((key) => t(key))
              return (
                <Link
                  key={page.slug}
                  href={href}
                  data-seo-event="feature_card_click"
                  data-seo-target={page.slug}
                  className="group block h-full"
                >
                  <SectionCard
                    icon={Icon}
                    tone="accent"
                    eyebrow={t(`${page.messageKey}Eyebrow`)}
                    title={t(`${page.messageKey}Heading`)}
                    description={t(`${page.messageKey}Lead`)}
                    className="h-full transition-colors group-hover:border-accent/60 group-hover:bg-surface-2"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.slice(0, 3).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-border px-2 py-1 text-[11px] text-muted"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                </Link>
              )
            })}
          </section>

          <SectionCard tone="info" className="border-info/30 bg-info-soft">
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-200 transition-colors"
              >
                {t('indexDocsCta')}
              </Link>
            </div>
          </SectionCard>
        </main>
      </div>
    </>
  )
}
