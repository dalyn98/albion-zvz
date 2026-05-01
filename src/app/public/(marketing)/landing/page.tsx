import {
  Calendar,
  Coins,
  Hammer,
  ShoppingBag,
  BarChart3,
  Check,
  Sparkles,
  Hourglass,
  HelpCircle,
  ArrowRight,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import ScreenshotPlaceholder from '@/components/ScreenshotPlaceholder'
import {
  MARKETING_SCREENSHOTS,
  type MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'
import { getMarketingPaths } from '@/lib/marketing-paths'

export const dynamic = 'force-dynamic'

interface FeatureSection {
  imagePosition: 'left' | 'right'
  icon: typeof Calendar
  title: string
  body: string
  bullets: string[]
  screenshotLabel: string
  screenshotKey: MarketingScreenshotKey
}

const FAQ_KEYS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6',
  'q7', 'q8', 'q9', 'q10', 'q11', 'q12',
  'q13', 'q14', 'q15',
] as const
type FaqKey = (typeof FAQ_KEYS)[number]
type FaqAnswerKey =
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'
  | 'a7' | 'a8' | 'a9' | 'a10' | 'a11' | 'a12'
  | 'a13' | 'a14' | 'a15'
const FAQ_ANSWER_KEY: Record<FaqKey, FaqAnswerKey> = {
  q1: 'a1', q2: 'a2', q3: 'a3', q4: 'a4', q5: 'a5', q6: 'a6',
  q7: 'a7', q8: 'a8', q9: 'a9', q10: 'a10', q11: 'a11', q12: 'a12',
  q13: 'a13', q14: 'a14', q15: 'a15',
}

export default async function PublicLandingPage() {
  const [t, tFeat, tPrice, tFaq, tMkt, paths] = await Promise.all([
    getTranslations('publicLanding'),
    getTranslations('publicFeatures'),
    getTranslations('publicPricing'),
    getTranslations('publicFaq'),
    getTranslations('publicMarketing'),
    getMarketingPaths(),
  ])
  const installHref = '/api/auth/discord/start?returnTo=%2Fonboard'

  const featureSections: FeatureSection[] = [
    {
      imagePosition: 'right',
      icon: Calendar,
      title: tFeat('f1Title'),
      body: tFeat('f1Body'),
      bullets: [tFeat('f1Bullet1'), tFeat('f1Bullet2'), tFeat('f1Bullet3')],
      screenshotLabel: tFeat('f1ScreenshotLabel'),
      screenshotKey: 'events',
    },
    {
      imagePosition: 'left',
      icon: Coins,
      title: tFeat('f2Title'),
      body: tFeat('f2Body'),
      bullets: [tFeat('f2Bullet1'), tFeat('f2Bullet2'), tFeat('f2Bullet3')],
      screenshotLabel: tFeat('f2ScreenshotLabel'),
      screenshotKey: 'regear',
    },
    {
      imagePosition: 'right',
      icon: Hammer,
      title: tFeat('f5Title'),
      body: tFeat('f5Body'),
      bullets: [tFeat('f5Bullet1'), tFeat('f5Bullet2'), tFeat('f5Bullet3')],
      screenshotLabel: tFeat('f5ScreenshotLabel'),
      screenshotKey: 'craft',
    },
    {
      imagePosition: 'left',
      icon: ShoppingBag,
      title: tFeat('f3Title'),
      body: tFeat('f3Body'),
      bullets: [tFeat('f3Bullet1'), tFeat('f3Bullet2'), tFeat('f3Bullet3')],
      screenshotLabel: tFeat('f3ScreenshotLabel'),
      screenshotKey: 'shop',
    },
    {
      imagePosition: 'right',
      icon: BarChart3,
      title: tFeat('f4Title'),
      body: tFeat('f4Body'),
      bullets: [tFeat('f4Bullet1'), tFeat('f4Bullet2'), tFeat('f4Bullet3')],
      screenshotLabel: tFeat('f4ScreenshotLabel'),
      screenshotKey: 'stats',
    },
  ]

  const betaFeatures = [
    tPrice('betaFeature1'),
    tPrice('betaFeature2'),
    tPrice('betaFeature3'),
    tPrice('betaFeature4', { slug: 'your-guild' }),
    tPrice('betaFeature5'),
  ]
  const proFeatures = [
    tPrice('proFeature1'),
    tPrice('proFeature2'),
    tPrice('proFeature3'),
    tPrice('proFeature4'),
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
                {t('ctaPrimary')}
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                {tFeat('pageTitle')}
                <ArrowRight size={16} />
              </a>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed pt-1 max-w-md mx-auto">
              {tMkt('installPermissionNote')}
            </p>
          </section>

          <section className="space-y-5 scroll-mt-20">
            <div className="text-center space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold">{tMkt('screenshotsTitle')}</h2>
              <p className="text-xs text-gray-500 max-w-xl mx-auto">{tMkt('screenshotsCaption')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ScreenshotPlaceholder
                label={tFeat('f1ScreenshotLabel')}
                aspect="16/9"
                src={MARKETING_SCREENSHOTS.events}
              />
              <ScreenshotPlaceholder
                label={tFeat('f2ScreenshotLabel')}
                aspect="16/9"
                src={MARKETING_SCREENSHOTS.regear}
              />
              <ScreenshotPlaceholder
                label={tFeat('f5ScreenshotLabel')}
                aspect="16/9"
                src={MARKETING_SCREENSHOTS.craft}
              />
              <ScreenshotPlaceholder
                label={tFeat('f3ScreenshotLabel')}
                aspect="16/9"
                src={MARKETING_SCREENSHOTS.shop}
              />
              <ScreenshotPlaceholder
                label={tFeat('f4ScreenshotLabel')}
                aspect="16/9"
                src={MARKETING_SCREENSHOTS.stats}
              />
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
                </div>
                <div className={section.imagePosition === 'left' ? 'md:order-1' : ''}>
                  <ScreenshotPlaceholder
                    label={section.screenshotLabel}
                    aspect="4/3"
                    src={MARKETING_SCREENSHOTS[section.screenshotKey]}
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

          <section id="pricing" className="space-y-8 scroll-mt-20">
            <div className="text-center space-y-3">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
                {tPrice('pageTitle')}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{tPrice('pageSubtitle')}</h2>
              <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
                {tPrice('pageLead')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 max-w-4xl mx-auto w-full">
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-6 space-y-4 relative">
                <span className="absolute -top-2 left-6 text-[10px] font-bold tracking-[0.2em] text-amber-300 bg-[#0f1117] border border-amber-400/40 px-2 py-0.5 rounded-full">
                  BETA
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Sparkles size={16} />
                    <span className="text-xs uppercase tracking-wider font-semibold">
                      {tPrice('betaPlanLabel')}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-white">{tPrice('betaPlanPrice')}</span>
                  </div>
                  <p className="text-xs text-gray-400">{tPrice('betaPlanPriceNote')}</p>
                </div>
                <ul className="space-y-2 pt-1">
                  {betaFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-200">
                      <Check size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={installHref}
                  className="block text-center bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  {tPrice('betaPlanCta')}
                </a>
                <p className="text-[11px] text-amber-100/60 leading-relaxed">
                  {tMkt('installPermissionNote')}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-700 bg-gray-900/40 p-6 space-y-4 relative">
                <span className="absolute -top-2 left-6 text-[10px] font-bold tracking-[0.2em] text-gray-400 bg-[#0f1117] border border-gray-700 px-2 py-0.5 rounded-full">
                  COMING SOON
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Hourglass size={16} />
                    <span className="text-xs uppercase tracking-wider font-semibold">
                      {tPrice('proPlanLabel')}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-gray-300">{tPrice('proPlanPrice')}</span>
                  </div>
                  <p className="text-xs text-gray-500">{tPrice('proPlanPriceNote')}</p>
                </div>
                <ul className="space-y-2 pt-1">
                  {proFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled
                  className="block w-full text-center bg-gray-800/50 text-gray-500 font-semibold px-5 py-2.5 rounded-lg cursor-not-allowed"
                >
                  {tPrice('proPlanCtaNote')}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6 max-w-3xl mx-auto space-y-2">
              <h3 className="text-sm font-semibold text-amber-300">{tPrice('noteTitle')}</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{tPrice('noteBody')}</p>
            </div>
          </section>

          <section id="faq" className="space-y-6 scroll-mt-20">
            <div className="text-center space-y-3">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
                {tFaq('pageSubtitle')}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{tFaq('pageTitle')}</h2>
            </div>

            <div className="max-w-3xl mx-auto space-y-3">
              {FAQ_KEYS.map((qKey) => (
                <details
                  key={qKey}
                  className="group rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 open:bg-gray-900/80"
                >
                  <summary className="flex items-start gap-3 cursor-pointer list-none text-sm font-semibold text-white">
                    <HelpCircle
                      size={16}
                      className="text-amber-300 mt-0.5 flex-shrink-0"
                    />
                    <span className="flex-1">{tFaq(qKey)}</span>
                    <span className="text-gray-500 group-open:rotate-180 transition-transform text-xs">
                      ▼
                    </span>
                  </summary>
                  <p className="mt-3 ml-7 text-sm text-gray-300 leading-relaxed">
                    {tFaq(FAQ_ANSWER_KEY[qKey])}
                  </p>
                </details>
              ))}
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
                {t('ctaPrimary')}
              </a>
              <a
                href="/api/auth/discord/start?returnTo=%2F"
                className="inline-flex items-center justify-center bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {t('loginInstead')}
              </a>
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
