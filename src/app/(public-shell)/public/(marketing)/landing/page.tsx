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
import {
  LedgerSurface,
  SequenceSurface,
  SituationSurface,
  WorkbenchSurface,
} from '@/components/ui-patterns'

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

  const featureChapters = [
    featureSections.slice(0, 2),
    featureSections.slice(2, 4),
    featureSections.slice(4, 6),
  ]

  return (
    <>
      <MarketingNav active="home" />
      <div className="text-foreground">
        <div className="mx-auto max-w-6xl space-y-20 px-5 py-12 sm:px-8 sm:py-16 lg:space-y-28">
          <section className="grid items-center gap-10 scroll-mt-20 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                <span className="h-px w-8 bg-amber-400" />
                {tMkt('heroBadge')}
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{t('siteName')}</p>
              <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                {t('tagline')}
              </h1>
              <p className="max-w-2xl text-pretty text-sm leading-relaxed text-gray-300 sm:text-base">
                {t('subheading')}
              </p>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <MarketingMyGuildCta
                  installHref={installHref}
                  installLabel={primaryCtaLabel}
                  myGuildLabel={myGuildCtaLabel}
                  installClassName="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#5865F2] px-6 py-3 font-semibold text-white transition-[background-color,transform] hover:bg-[#4752c4] active:scale-[0.96]"
                  myGuildClassName="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-amber-500 px-6 py-3 font-semibold text-black transition-[background-color,transform] hover:bg-amber-400 active:scale-[0.96]"
                  iconSize={16}
                />
                <Link href={paths.demo} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-gray-800">
                  <PlayCircle size={16} />
                  {t('tryDemoButton')}
                </Link>
              </div>
              <InAppBrowserNoticeWithMessages />
              <p className="max-w-md text-[11px] leading-relaxed text-gray-500">{tMkt('installPermissionNote')}</p>
            </div>

            <WorkbenchSurface className="bg-gray-950/75">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">{t('heroPreviewEyebrow')}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{t('heroPreviewTitle')}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t('heroPreviewBadge')}
                </span>
              </div>
              <div className="p-2 sm:p-3">
                <MarketingScreenshotCarousel images={screenshots.stats} fallbackLabel={tFeat('f4ScreenshotLabel')} aspect="16/9" priorityFirstImage editable={isAdmin} slot="stats" />
              </div>
              <dl className="grid grid-cols-3 border-t border-white/10">
                {heroPreviewStats.map((stat) => (
                  <div key={stat.label} className="border-r border-white/10 px-3 py-3 text-center last:border-r-0">
                    <dd className="font-mono text-lg font-black leading-none text-amber-200 tabular-nums">{stat.value}</dd>
                    <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </WorkbenchSurface>
          </section>

          <SituationSurface className="grid gap-0 p-0 sm:grid-cols-3">
            {proofCards.map((card) => (
              <div key={card.value} className="flex items-start gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <card.icon size={17} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <p className="font-mono text-lg font-black text-white tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{card.label}</p>
                </div>
              </div>
            ))}
          </SituationSurface>

          <section className="grid gap-8 scroll-mt-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="space-y-4 lg:sticky lg:top-24">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300/80">{t('firstSuccessBadge')}</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t('firstSuccessTitle')}</h2>
              <p className="text-pretty text-sm leading-relaxed text-gray-300 sm:text-base">{t('firstSuccessLead')}</p>
              <MarketingScreenshotCarousel images={screenshots.events} fallbackLabel={tFeat('f1ScreenshotLabel')} aspect="4/3" editable={isAdmin} slot="events" />
            </div>
            <SequenceSurface className="p-0">
              <ol>
                {firstSuccessSteps.map((step, idx) => (
                  <li key={step.title} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-white/10 last:border-b-0">
                    <div className="flex flex-col items-center border-r border-white/10 py-5">
                      <span className="font-mono text-xs font-black text-sky-300">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="mt-3 flex h-8 w-8 items-center justify-center border border-sky-400/30 bg-sky-400/10 text-sky-200"><step.icon size={15} /></span>
                    </div>
                    <div className="px-5 py-5">
                      <h3 className="text-base font-semibold text-white">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-400">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </SequenceSurface>
          </section>

          <section className="grid gap-8 scroll-mt-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">{t('memberValueBadge')}</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('memberValueTitle')}</h2>
                <p className="text-sm leading-relaxed text-gray-300 sm:text-base">{t('memberValueLead')}</p>
              </div>
              <div className="border-y border-white/10">
                {audienceCards.map((card) => (
                  <article key={card.title} className="border-b border-white/10 py-5 last:border-b-0">
                    <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">{card.body}</p>
                    <ul className="mt-3 space-y-2">
                      {card.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-sm text-gray-300"><Check size={14} className="mt-0.5 shrink-0 text-sky-300" />{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
            <LedgerSurface>
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{t('audienceTitle')}</p>
                <p className="mt-1 text-sm text-gray-300">{t('audienceLead')}</p>
              </div>
              {memberValueCards.map((card, index) => (
                <div key={card.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-start border-b border-white/10 px-4 py-4 last:border-b-0">
                  <card.icon size={17} className="mt-0.5 text-success-soft-foreground" />
                  <div><h3 className="text-sm font-semibold text-white">{card.title}</h3><p className="mt-1 text-xs leading-relaxed text-gray-400">{card.body}</p></div>
                  <span className="text-right font-mono text-[10px] text-gray-600">{String(index + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </LedgerSurface>
          </section>

          <section id="features" className="space-y-10 scroll-mt-20">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">{tFeat('pageSubtitle')}</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tFeat('pageHeading')}</h2>
              <p className="text-sm leading-relaxed text-gray-300 sm:text-base">{tFeat('pageLead')}</p>
            </div>
            <div className="space-y-8">
              {featureChapters.map((chapter, chapterIndex) => {
                const lead = chapter[0]
                return (
                  <WorkbenchSurface key={lead.title} className="grid lg:grid-cols-[1.08fr_0.92fr]">
                    <div className={`p-3 ${chapterIndex % 2 === 1 ? 'lg:order-2' : ''}`}>
                      <MarketingScreenshotCarousel images={screenshots[lead.screenshotKey]} fallbackLabel={lead.screenshotLabel} aspect="4/3" editable={isAdmin} slot={lead.screenshotKey} />
                    </div>
                    <div className={`border-t border-white/10 lg:border-t-0 ${chapterIndex % 2 === 1 ? 'lg:border-r' : 'lg:border-l'} lg:border-white/10`}>
                      {chapter.map((feature) => (
                        <article key={feature.title} className="border-b border-white/10 px-5 py-5 last:border-b-0">
                          <div className="flex items-center gap-2 text-amber-300"><feature.icon size={16} /><h3 className="text-base font-semibold text-white">{feature.title}</h3></div>
                          <p className="mt-2 text-sm leading-relaxed text-gray-400">{feature.body}</p>
                          <ul className="mt-3 space-y-1.5">{feature.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-xs text-gray-300"><Check size={13} className="mt-0.5 shrink-0 text-amber-300" />{bullet}</li>)}</ul>
                          <Link href={resolveMarketingHref(paths, feature.href)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-amber-300 hover:text-amber-200">{tFeat('learnMoreCta')} <ArrowRight size={14} /></Link>
                        </article>
                      ))}
                    </div>
                  </WorkbenchSurface>
                )
              })}
            </div>
            <Link href={paths.docs} className="inline-flex min-h-10 items-center gap-1 text-sm text-amber-300 hover:text-amber-200">{t('docsCta')} <ArrowRight size={14} /></Link>
          </section>

          <section className="grid gap-8 scroll-mt-20 lg:grid-cols-2">
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight">{t('howTitle')}</h2>
              <SequenceSurface className="p-0">
                <ol>
                  {(['howStep1', 'howStep2', 'howStep3'] as const).map((key, idx) => (
                    <li key={key} className="flex items-start gap-3 border-b border-white/10 px-4 py-4 last:border-b-0">
                      <span className="font-mono text-xs font-black text-amber-300">{String(idx + 1).padStart(2, '0')}</span>
                      <p className="text-sm leading-relaxed text-gray-200">{key === 'howStep3' ? t.rich(key, { slug: (chunks) => <code className="bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-amber-200">{chunks}</code> }) : t(key)}</p>
                    </li>
                  ))}
                </ol>
              </SequenceSurface>
            </div>
            <SituationSurface id="pricing" className="flex flex-col justify-between space-y-5 scroll-mt-20">
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">{tPricing('badge')}</p>
                <h2 className="text-2xl font-semibold text-white">{tPricing('title')}</h2>
                <p className="text-sm leading-relaxed text-emerald-100/80">{tPricing('planBody')}</p>
                <p className="border-t border-white/10 pt-4 text-sm text-amber-100/80"><span className="font-semibold text-white">{tMkt('ctaBoxTitle')}</span><br />{tMkt('ctaBoxBody')}</p>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <MarketingMyGuildCta installHref={installHref} installLabel={primaryCtaLabel} myGuildLabel={myGuildCtaLabel} installClassName="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#5865F2] px-5 py-2.5 font-semibold text-white hover:bg-[#4752c4]" myGuildClassName="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 font-semibold text-black hover:bg-amber-400" iconSize={14} />
                  <Link href={paths.pricing} className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-700 px-5 py-2.5 font-semibold text-white hover:bg-gray-800">{t('pricingCta')}</Link>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-500">{tMkt('installPermissionNote')}</p>
              </div>
            </SituationSurface>
          </section>

          <p className="text-center text-[11px] tracking-wide text-gray-500">{t('footerNote')}</p>
        </div>
      </div>
    </>
  )
}
