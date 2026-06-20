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
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import InAppBrowserNoticeWithMessages from '@/components/InAppBrowserNoticeWithMessages'

export const revalidate = 3600

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

  // 카드 순서 = USP 우선순위. 통계(f4) 가 가장 강한 차별화이므로 메인,
  // 다음으로 자동 리기어(f2), 통합 운영 흐름(f1), 보조 기능(상점/제작) 순.
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
      icon: Calendar,
      href: '/features/guild-events',
      title: tFeat('f1Title'),
      body: tFeat('f1Body'),
      bullets: [tFeat('f1Bullet1'), tFeat('f1Bullet2'), tFeat('f1Bullet3')],
      screenshotLabel: tFeat('f1ScreenshotLabel'),
      screenshotKey: 'events',
    },
    {
      imagePosition: 'left',
      icon: LayoutTemplate,
      href: '/features/guild-events',
      title: tFeat('f6Title'),
      body: tFeat('f6Body'),
      bullets: [tFeat('f6Bullet1'), tFeat('f6Bullet2'), tFeat('f6Bullet3')],
      screenshotLabel: tFeat('f6ScreenshotLabel'),
      screenshotKey: 'builds',
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
      <div className="bg-[#0f1117] text-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-12 sm:py-16 space-y-20 sm:space-y-24">
          <section className="text-center space-y-5 scroll-mt-20">
            <span className="inline-block text-[10px] font-bold tracking-[0.25em] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              {tMkt('heroBadge')}
            </span>
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {t('siteName')}
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight">{t('tagline')}</h1>
            <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
              {t('subheading')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
              <a
                href={installHref}
                className="inline-flex items-center justify-center bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-6 py-3 rounded-xl shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] transition-colors"
              >
                {primaryCtaLabel}
              </a>
              <Link
                href={paths.demo}
                className="inline-flex items-center justify-center gap-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                <PlayCircle size={16} />
                {t('tryDemoButton')}
              </Link>
            </div>
            <div className="mx-auto max-w-sm">
              <InAppBrowserNoticeWithMessages />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed pt-1 max-w-md mx-auto">
              {tMkt('installPermissionNote')}
            </p>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 scroll-mt-20">
            {proofCards.map((card) => (
              <div
                key={card.value}
                className="rounded-xl border border-gray-800 bg-gray-900/55 p-4 text-center"
              >
                <card.icon size={18} className="mx-auto text-amber-300" />
                <div className="mt-3 text-base sm:text-lg font-black text-white leading-tight">
                  {card.value}
                </div>
                <p className="mt-1 text-xs text-gray-400 leading-relaxed">{card.label}</p>
              </div>
            ))}
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
                <div
                  key={card.title}
                  className="rounded-xl border border-gray-800 bg-gray-900/60 p-4"
                >
                  <card.icon size={18} className="text-emerald-300" />
                  <h3 className="mt-3 text-sm font-bold text-white leading-snug">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                    {card.body}
                  </p>
                </div>
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
                <div
                  key={card.title}
                  className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6"
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
                </div>
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
                    className="inline-flex items-center gap-1 pt-1 text-sm font-semibold text-amber-300 hover:text-amber-200"
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
                className="inline-flex items-center gap-1 text-sm text-amber-300 hover:text-amber-200"
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
              <a
                href={installHref}
                className="inline-flex items-center justify-center bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {primaryCtaLabel}
              </a>
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
