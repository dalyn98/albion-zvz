import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CalendarCheck,
  Check,
  Database,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'
import InAppBrowserNoticeWithMessages from '@/components/InAppBrowserNoticeWithMessages'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('meta')
  return {
    title: t('pricingTitle'),
    description: t('pricingDescription'),
    openGraph: {
      type: 'website',
      title: t('pricingTitle'),
      description: t('pricingDescription'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('pricingTitle'),
      description: t('pricingDescription'),
    },
  }
}

export default async function PublicPricingPage() {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicPricing'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const installHref = '/login?returnTo=%2Fonboard'
  const primaryCtaLabel = t('ctaPrimary')

  const includedKeys = [
    'includedEvents',
    'includedStats',
    'includedRegear',
    'includedShop',
    'includedCraft',
    'includedPublicProfile',
  ] as const

  const policyCards = [
    {
      icon: ShieldCheck,
      title: t('betaPolicyTitle'),
      body: t('betaPolicyBody'),
    },
    {
      icon: Sparkles,
      title: t('futurePolicyTitle'),
      body: t('futurePolicyBody'),
    },
    {
      icon: HelpCircle,
      title: t('supportPolicyTitle'),
      body: t('supportPolicyBody'),
    },
  ]
  const validationCards = [
    {
      icon: CalendarCheck,
      title: t('validationEventsTitle'),
      body: t('validationEventsBody'),
    },
    {
      icon: UserRoundCheck,
      title: t('validationMembersTitle'),
      body: t('validationMembersBody'),
    },
    {
      icon: Database,
      title: t('validationDataTitle'),
      body: t('validationDataBody'),
    },
  ]

  return (
    <>
      <MarketingNav active="pricing" />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16 space-y-12">
          <section className="text-center space-y-5">
            <p className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">
              {t('badge')}
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-bold leading-tight text-white">
                {t('title')}
              </h1>
              <p className="mx-auto max-w-2xl text-sm sm:text-base leading-relaxed text-gray-300">
                {t('subtitle')}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5 items-stretch">
            <SectionCard tone="success" className="space-y-5 border-success/30 bg-success-soft">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                  {t('planLabel')}
                </p>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    {t('price')}
                  </span>
                  <span className="text-sm text-gray-400">{t('priceNote')}</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-gray-300">{t('planBody')}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={installHref}
                  className="inline-flex items-center justify-center rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
                >
                  {primaryCtaLabel}
                </a>
                <Link
                  href={paths.demo}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900/80 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                >
                  {t('ctaDemo')}
                </Link>
              </div>
              <div className="max-w-sm">
                <InAppBrowserNoticeWithMessages />
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="text-lg font-bold text-white">{t('includedTitle')}</h2>
              <ul className="mt-5 space-y-3">
                {includedKeys.map((key) => (
                  <li key={key} className="flex items-start gap-3 text-sm text-gray-200">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {policyCards.map((card) => (
              <SectionCard
                key={card.title}
                icon={card.icon}
                tone="accent"
                title={card.title}
                description={card.body}
              />
            ))}
          </section>

          <section className="space-y-5 border-y border-border py-6 sm:py-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                {t('validationBadge')}
              </p>
              <h2 className="mt-2 text-xl sm:text-2xl font-bold text-white">
                {t('validationTitle')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                {t('validationLead')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {validationCards.map((card) => (
                <SectionCard
                  key={card.title}
                  icon={card.icon}
                  tone="info"
                  title={card.title}
                  description={card.body}
                />
              ))}
            </div>
          </section>

          <SectionCard tone="accent" className="space-y-4 text-center">
            <h2 className="text-lg font-bold text-white">{t('questionTitle')}</h2>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-300">
              {t('questionBody')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2">
              <Link
                href={paths.docs}
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                {t('ctaDocs')}
              </Link>
              <Link
                href={paths.faq}
                className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900/80 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                {t('ctaFaq')}
              </Link>
            </div>
          </SectionCard>
        </main>
      </div>
    </>
  )
}
