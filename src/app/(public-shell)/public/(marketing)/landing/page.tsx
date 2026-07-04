import {
  Calendar,
  Coins,
  Hammer,
  ShoppingBag,
  BarChart3,
  Check,
  ArrowRight,
  PlayCircle,
  ClipboardList,
  Gauge,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Zap,
  KeyRound,
  LayoutTemplate,
} from 'lucide-react'
import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingScreenshotCarousel from '@/components/MarketingScreenshotCarousel'
import {
  loadMarketingScreenshots,
  type MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'
import { buildPublicLandingMetadata } from '@/lib/seo-metadata'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import InAppBrowserNoticeWithMessages from '@/components/InAppBrowserNoticeWithMessages'
import MarketingMyGuildCta from '@/components/MarketingMyGuildCta'
import { SectionCard, ValueDisplay } from '@/components/ui-patterns'

export const revalidate = 3600

export const generateMetadata = () =>
  buildPublicLandingMetadata(process.env.GOOGLE_SITE_VERIFICATION)

interface FeatureSection {
  imagePosition: 'left' | 'right'
  icon: typeof Calendar
  href: string
  title: string
  body: string
  bullets: string[]
  screenshotLabel: string
  screenshotKey: MarketingScreenshotKey
}

export default async function PublicLandingPage() {
  const [screenshots, locale, t, tFeat, tMkt, tPricing] = await Promise.all([
    loadMarketingScreenshots(),
    getMarketingLocale(),
    getMarketingTranslator('publicLanding'),
    getMarketingTranslator('publicFeatures'),
    getMarketingTranslator('publicMarketing'),
    getMarketingTranslator('publicPricing'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const installHref = '/api/auth/discord/start?returnTo=%2Fonboard'
  const primaryCtaLabel = t('ctaPrimary')
  const myGuildCtaLabel = t('ctaMyGuild')
  const isAdmin = false
  const proofCards = [
    {
      icon: ClipboardList,
      value: t('proofEventValue'),
      label: t('proofEventLabel'),
    },
    {
      icon: Gauge,
      value: t('proofStatsValue'),
      label: t('proofStatsLabel'),
    },
    {
      icon: Users,
      value: t('proofMemberValue'),
      label: t('proofMemberLabel'),
    },
  ]
  const memberValueCards = [
    {
      icon: Calendar,
      title: t('memberEventsTitle'),
      body: t('memberEventsBody'),
    },
    {
      icon: KeyRound,
      title: t('memberLocalAccountTitle'),
      body: t('memberLocalAccountBody'),
    },
    {
      icon: Wallet,
      title: t('memberWalletTitle'),
      body: t('memberWalletBody'),
    },
    {
      icon: ShieldCheck,
      title: t('memberRegearTitle'),
      body: t('memberRegearBody'),
    },
    {
      icon: Trophy,
      title: t('memberRankingTitle'),
      body: t('memberRankingBody'),
    },
    {
      icon: Zap,
      title: t('memberSiphonTitle'),
      body: t('memberSiphonBody'),
    },
  ]
  const audienceCards = [
    {
      title: t('operatorBenefitTitle'),
      body: t('operatorBenefitBody'),
      bullets: [
        t('operatorBenefitBullet1'),
        t('operatorBenefitBullet2'),
        t('operatorBenefitBullet3'),
      ],
    },
    {
      title: t('memberBenefitTitle'),
      body: t('memberBenefitBody'),
      bullets: [
        t('memberBenefitBullet1'),
        t('memberBenefitBullet2'),
        t('memberBenefitBullet3'),
      ],
    },
  ]
  const heroPreviewStats = [
    { value: t('heroPreviewStat1Value'), label: t('heroPreviewStat1Label') },
    { value: t('heroPreviewStat2Value'), label: t('heroPreviewStat2Label') },
    { value: t('heroPreviewStat3Value'), label: t('heroPreviewStat3Label') },
  ]
  const firstSuccessSteps = [
    {
      icon: KeyRound,
      title: t('firstSuccessStep1Title'),
      body: t('firstSuccessStep1Body'),
    },
    {
      icon: Calendar,
      title: t('firstSuccessStep2Title'),
      body: t('firstSuccessStep2Body'),
    },
    {
      icon: Users,
      title: t('firstSuccessStep3Title'),
      body: t('firstSuccessStep3Body'),
    },
    {
      icon: BarChart3,
      title: t('firstSuccessStep4Title'),
      body: t('firstSuccessStep4Body'),
    },
  ]

  // 카드 순서 = USP 우선순위. raw killboard 와 다른 깨끗한 ZvZ 통계를 메인으로,
  // 첫 이벤트/빌드 성공 흐름을 다음에 두고, 리기어/상점/제작은 검토형 보조 자동화로 둔다.
  const featureSections: FeatureSection[] = [
    {
      imagePosition: 'right',
      icon: BarChart3,
      href: '/features/zvz-killboard',
      title: tFeat('f4Title'),
      body: tFeat('f4Body'),
      bullets: [tFeat('f4Bullet1'), tFeat('f4Bullet2'), tFeat('f4Bullet3')],
      screenshotLabel: tFeat('f4ScreenshotLabel'),
      screenshotKey: 'stats',
    },
    {
      imagePosition: 'left',
      icon: Calendar,
      href: '/features/guild-events',
      title: tFeat('f1Title'),
      body: tFeat('f1Body'),
      bullets: [tFeat('f1Bullet1'), tFeat('f1Bullet2'), tFeat('f1Bullet3')],
      screenshotLabel: tFeat('f1ScreenshotLabel'),
      screenshotKey: 'events',
    },
    {
      imagePosition: 'right',
      icon: LayoutTemplate,
      href: '/features/guild-events',
      title: tFeat('f6Title'),
      body: tFeat('f6Body'),
      bullets: [tFeat('f6Bullet1'), tFeat('f6Bullet2'), tFeat('f6Bullet3')],
      screenshotLabel: tFeat('f6ScreenshotLabel'),
      screenshotKey: 'builds',
    },
    {
      imagePosition: 'left',
      icon: Coins,
      href: '/features/auto-regear',
      title: tFeat('f2Title'),
      body: tFeat('f2Body'),
      bullets: [tFeat('f2Bullet1'), tFeat('f2Bullet2'), tFeat('f2Bullet3')],
      screenshotLabel: tFeat('f2ScreenshotLabel'),
      screenshotKey: 'regear',
    },
    {
      imagePosition: 'right',
      icon: ShoppingBag,
      href: '/features/guild-shop',
      title: tFeat('f3Title'),
      body: tFeat('f3Body'),
      bullets: [tFeat('f3Bullet1'), tFeat('f3Bullet2'), tFeat('f3Bullet3')],
      screenshotLabel: tFeat('f3ScreenshotLabel'),
      screenshotKey: 'shop',
    },
    {
      imagePosition: 'left',
      icon: Hammer,
      href: '/features/auto-regear',
      title: tFeat('f5Title'),
      body: tFeat('f5Body'),
      bullets: [tFeat('f5Bullet1'), tFeat('f5Bullet2'), tFeat('f5Bullet3')],
      screenshotLabel: tFeat('f5ScreenshotLabel'),
      screenshotKey: 'craft',
    },
  ]

  return (
    <>
      <MarketingNav active="home" />
      <div className="bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 space-y-20 sm:space-y-24">
          <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10 scroll-mt-20">
            <div className="space-y-5 text-center lg:text-left">
              <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.25em] text-amber-300">
                {tMkt('heroBadge')}
              </span>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80 sm:text-sm">
                {t('siteName')}
              </p>
              <h1 className="text-balance text-3xl font-bold leading-tight sm:text-5xl">
                {t('tagline')}
              </h1>
              <p className="mx-auto max-w-2xl text-pretty text-sm leading-relaxed text-gray-300 sm:text-base lg:mx-0">
                {t('subheading')}
              </p>
              <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row lg:justify-start">
                <MarketingMyGuildCta
                  installHref={installHref}
                  installLabel={primaryCtaLabel}
                  myGuildLabel={myGuildCtaLabel}
                  installClassName="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] transition-[background-color,transform] hover:bg-[#4752c4] active:scale-[0.96]"
                  myGuildClassName="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-black shadow-[0_10px_30px_-10px_rgba(245,158,11,0.5)] transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.96]"
                  iconSize={16}
                />
                <Link
                  href={paths.demo}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/60 px-6 py-3 font-semibold text-white transition-[background-color,transform] hover:bg-gray-800 active:scale-[0.96]"
                >
                  <PlayCircle size={16} />
                  {t('tryDemoButton')}
                </Link>
              </div>
              <div className="mx-auto max-w-sm lg:mx-0">
                <InAppBrowserNoticeWithMessages />
              </div>
              <p className="mx-auto max-w-md pt-1 text-[11px] leading-relaxed text-gray-500 lg:mx-0">
                {tMkt('installPermissionNote')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-3 rounded-2xl bg-gray-950/70 p-2 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.85)] ring-1 ring-white/10 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
                      {t('heroPreviewEyebrow')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {t('heroPreviewTitle')}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                    {t('heroPreviewBadge')}
                  </span>
                </div>
                <MarketingScreenshotCarousel
                  images={screenshots.stats}
                  fallbackLabel={tFeat('f4ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="stats"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {heroPreviewStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center"
                  >
                    <p className="font-mono text-lg font-black leading-none text-amber-200 tabular-nums">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 scroll-mt-20">
            {proofCards.map((card) => (
              <SectionCard
                key={card.value}
                className="p-4 text-center sm:p-4"
              >
                <ValueDisplay
                  icon={card.icon}
                  tone="accent"
                  align="center"
                  size="sm"
                  label={card.label}
                  value={card.value}
                />
              </SectionCard>
            ))}
          </section>

          <section className="space-y-5 scroll-mt-20">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/80">
                {t('firstSuccessBadge')}
              </p>
              <h2 className="text-balance text-2xl font-bold leading-tight sm:text-3xl">
                {t('firstSuccessTitle')}
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-gray-300 sm:text-base">
                {t('firstSuccessLead')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {firstSuccessSteps.map((step, idx) => (
                <SectionCard key={step.title} className="p-4 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-200">
                      <step.icon size={17} />
                    </span>
                    <span className="font-mono text-xs font-black text-sky-300/70">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-bold leading-snug text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-pretty text-xs leading-relaxed text-gray-400">
                    {step.body}
                  </p>
                </SectionCard>
              ))}
            </div>
          </section>

          {isAdmin && (
            <section className="space-y-5 scroll-mt-20">
              <div className="text-center space-y-1.5">
                <h2 className="text-xl sm:text-2xl font-bold">{tMkt('screenshotsTitle')}</h2>
                <p className="text-xs text-gray-500 max-w-xl mx-auto">{tMkt('screenshotsCaption')}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
                  {tMkt('screenshotsAdminOnlyBadge')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MarketingScreenshotCarousel
                  images={screenshots.stats}
                  fallbackLabel={tFeat('f4ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="stats"
                />
                <MarketingScreenshotCarousel
                  images={screenshots.regear}
                  fallbackLabel={tFeat('f2ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="regear"
                />
                <MarketingScreenshotCarousel
                  images={screenshots.events}
                  fallbackLabel={tFeat('f1ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="events"
                />
                <MarketingScreenshotCarousel
                  images={screenshots.builds}
                  fallbackLabel={tFeat('f6ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="builds"
                />
                <MarketingScreenshotCarousel
                  images={screenshots.shop}
                  fallbackLabel={tFeat('f3ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="shop"
                />
                <MarketingScreenshotCarousel
                  images={screenshots.craft}
                  fallbackLabel={tFeat('f5ScreenshotLabel')}
                  aspect="16/9"
                  editable={isAdmin}
                  slot="craft"
                />
              </div>
            </section>
          )}

          <section className="space-y-5 scroll-mt-20">
            <div className="text-center space-y-3">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                {t('memberValueBadge')}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                {t('memberValueTitle')}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
                {t('memberValueLead')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {memberValueCards.map((card) => (
                <SectionCard
                  key={card.title}
                  className="p-4 sm:p-4"
                >
                  <card.icon size={18} className="text-success-soft-foreground" />
                  <h3 className="mt-3 text-sm font-bold text-white leading-snug">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                    {card.body}
                  </p>
                </SectionCard>
              ))}
            </div>
          </section>

          <section className="space-y-5 scroll-mt-20">
            <div className="text-center space-y-3">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-sky-300/80">
                {t('audienceBadge')}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                {t('audienceTitle')}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
                {t('audienceLead')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {audienceCards.map((card) => (
                <SectionCard
                  key={card.title}
                  tone="info"
                  className="p-5 sm:p-6"
                >
                  <h3 className="text-lg font-bold text-white">{card.title}</h3>
                  <p className="mt-2 text-sm text-gray-300 leading-relaxed">{card.body}</p>
                  <ul className="mt-4 space-y-2">
                    {card.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm text-gray-200">
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-sky-300" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))}
            </div>
          </section>

          <section id="features" className="space-y-12 sm:space-y-16 scroll-mt-20">
            <div className="text-center space-y-3">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
                {tFeat('pageSubtitle')}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{tFeat('pageHeading')}</h2>
              <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
                {tFeat('pageLead')}
              </p>
            </div>

            {featureSections.map((section) => (
              <div
                key={section.title}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center"
              >
                <div
                  className={`space-y-3 ${section.imagePosition === 'left' ? 'md:order-2' : ''}`}
                >
                  <div className="flex items-center gap-2 text-amber-300">
                    <section.icon size={18} />
                    <span className="text-xs uppercase tracking-wider font-semibold">
                      {section.title}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                    {section.title}
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{section.body}</p>
                  <ul className="space-y-1.5 pt-1">
                    {section.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-gray-200">
                        <Check size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={resolveMarketingHref(paths, section.href)}
                    className="-mx-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-amber-300 hover:text-amber-200"
                  >
                    {tFeat('learnMoreCta')} <ArrowRight size={14} />
                  </Link>
                </div>
                <div className={section.imagePosition === 'left' ? 'md:order-1' : ''}>
                  <MarketingScreenshotCarousel
                    images={screenshots[section.screenshotKey]}
                    fallbackLabel={section.screenshotLabel}
                    aspect="4/3"
                    editable={isAdmin}
                    slot={section.screenshotKey}
                  />
                </div>
              </div>
            ))}

            <div className="text-center pt-2">
              <Link
                href={paths.docs}
                className="-mx-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm text-amber-300 hover:text-amber-200"
              >
                {t('docsCta')} <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          <section className="space-y-5 scroll-mt-20">
            <h2 className="text-xl sm:text-2xl font-bold text-center">{t('howTitle')}</h2>
            <ol className="space-y-3 max-w-2xl mx-auto">
              {(['howStep1', 'howStep2', 'howStep3'] as const).map((key, idx) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-200 text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {key === 'howStep3'
                      ? t.rich(key, {
                          slug: (chunks) => (
                            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-amber-200 text-xs font-mono">
                              {chunks}
                            </code>
                          ),
                        })
                      : t(key)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section
            id="pricing"
            className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-6 sm:p-8 text-center space-y-4 scroll-mt-20"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">
              {tPricing('badge')}
            </p>
            <div className="space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {tPricing('title')}
              </h2>
              <p className="text-sm text-emerald-100/80 max-w-2xl mx-auto leading-relaxed">
                {tPricing('planBody')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-2">
              <Link
                href={paths.pricing}
                className="inline-flex items-center justify-center bg-emerald-400 hover:bg-emerald-300 text-black font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {t('pricingCta')}
              </Link>
              <Link
                href={paths.demo}
                className="inline-flex items-center justify-center bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {t('tryDemoButton')}
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-6 sm:p-8 text-center space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-white">{tMkt('ctaBoxTitle')}</h2>
            <p className="text-sm text-amber-100/80">{tMkt('ctaBoxBody')}</p>
            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
              <MarketingMyGuildCta
                installHref={installHref}
                installLabel={primaryCtaLabel}
                myGuildLabel={myGuildCtaLabel}
                installClassName="inline-flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                myGuildClassName="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-5 py-2.5 rounded-lg transition-colors"
                iconSize={14}
              />
              <a
                href="/api/auth/discord/start?returnTo=%2F"
                className="inline-flex items-center justify-center bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {t('loginInstead')}
              </a>
            </div>
            <div className="mx-auto max-w-sm pt-1">
              <InAppBrowserNoticeWithMessages />
            </div>
            <p className="text-[11px] text-amber-100/60 leading-relaxed pt-1">
              {tMkt('installPermissionNote')}
            </p>
          </section>

          <p className="text-center text-[11px] text-gray-500 tracking-wide">{t('footerNote')}</p>
        </div>
      </div>
    </>
  )
}
