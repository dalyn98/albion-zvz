import { Check, Sparkles, Hourglass } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MarketingNav from '@/components/MarketingNav'

export const dynamic = 'force-dynamic'

export default async function PublicPricingPage() {
  const [t, tMkt] = await Promise.all([
    getTranslations('publicPricing'),
    getTranslations('publicMarketing'),
  ])

  // {slug} 같은 i18n placeholder 가 들어간 값은 .rich 로도 처리 가능하지만 현재는
  // 단순 문자열로 보여주는 게 충분하다. 추후 동적 슬러그 데모를 넣고 싶을 때 교체.
  const betaFeatures = [
    t('betaFeature1'),
    t('betaFeature2'),
    t('betaFeature3'),
    t('betaFeature4', { slug: 'your-guild' }),
    t('betaFeature5'),
  ]
  const proFeatures = [
    t('proFeature1'),
    t('proFeature2'),
    t('proFeature3'),
    t('proFeature4'),
  ]

  return (
    <>
      <MarketingNav active="pricing" />
      <div className="bg-[#0f1117] text-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-12 sm:py-16 space-y-12">
          <section className="text-center space-y-4">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {t('pageTitle')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{t('pageSubtitle')}</h1>
            <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
              {t('pageLead')}
            </p>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 max-w-4xl mx-auto w-full">
            {/* ─── Beta plan (현재) ─── */}
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-6 space-y-4 relative">
              <span className="absolute -top-2 left-6 text-[10px] font-bold tracking-[0.2em] text-amber-300 bg-[#0f1117] border border-amber-400/40 px-2 py-0.5 rounded-full">
                BETA
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-300">
                  <Sparkles size={16} />
                  <span className="text-xs uppercase tracking-wider font-semibold">
                    {t('betaPlanLabel')}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-white">{t('betaPlanPrice')}</span>
                </div>
                <p className="text-xs text-gray-400">{t('betaPlanPriceNote')}</p>
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
                href="/api/auth/discord/start?returnTo=%2Fonboard"
                className="block text-center bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {t('betaPlanCta')}
              </a>
              <p className="text-[11px] text-amber-100/60 leading-relaxed">
                {tMkt('installPermissionNote')}
              </p>
            </div>

            {/* ─── Pro plan (Coming soon) ─── */}
            <div className="rounded-2xl border border-gray-700 bg-gray-900/40 p-6 space-y-4 relative">
              <span className="absolute -top-2 left-6 text-[10px] font-bold tracking-[0.2em] text-gray-400 bg-[#0f1117] border border-gray-700 px-2 py-0.5 rounded-full">
                COMING SOON
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-gray-400">
                  <Hourglass size={16} />
                  <span className="text-xs uppercase tracking-wider font-semibold">
                    {t('proPlanLabel')}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-gray-300">{t('proPlanPrice')}</span>
                </div>
                <p className="text-xs text-gray-500">{t('proPlanPriceNote')}</p>
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
                {t('proPlanCtaNote')}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6 max-w-3xl mx-auto space-y-2">
            <h2 className="text-sm font-semibold text-amber-300">{t('noteTitle')}</h2>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{t('noteBody')}</p>
          </section>
        </div>
      </div>
    </>
  )
}
