import Link from 'next/link'
import { Calendar, Coins, ShoppingBag, BarChart3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-static'

export default async function PublicLandingPage() {
  const t = await getTranslations('publicLanding')
  const installHref = '/api/auth/discord/start?returnTo=%2Fonboard'

  const features: Array<{
    icon: typeof Calendar
    title: string
    body: string
  }> = [
    { icon: Calendar, title: t('feature1Title'), body: t('feature1Body') },
    { icon: Coins, title: t('feature2Title'), body: t('feature2Body') },
    { icon: ShoppingBag, title: t('feature3Title'), body: t('feature3Body') },
    { icon: BarChart3, title: t('feature4Title'), body: t('feature4Body') },
  ]

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <div className="mx-auto max-w-5xl px-5 sm:px-8 py-12 sm:py-20 space-y-16 sm:space-y-24">
        <section className="text-center space-y-6">
          <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
            {t('siteName')}
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">{t('tagline')}</h1>
          <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {t('subheading')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={installHref}
              className="inline-flex items-center justify-center w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-6 py-3 rounded-xl shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] transition-colors"
            >
              {t('ctaPrimary')}
            </a>
            <Link
              href="/public/records"
              className="inline-flex items-center justify-center w-full sm:w-auto border border-gray-700 hover:border-gray-500 text-gray-200 font-medium px-6 py-3 rounded-xl transition-colors"
            >
              {t('ctaSecondary')}
            </Link>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-center">{t('featuresTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-2"
              >
                <div className="flex items-center gap-2 text-amber-300">
                  <f.icon size={18} />
                  <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
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

        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-6 sm:p-8 text-center space-y-3">
          <p className="text-sm text-amber-100/80">{t('alreadyHaveGuild')}</p>
          <a
            href="/api/auth/discord/start?returnTo=%2F"
            className="inline-flex items-center justify-center bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {t('loginInstead')}
          </a>
        </section>

        <p className="text-center text-[11px] text-gray-500 tracking-wide">{t('footerNote')}</p>
      </div>
    </div>
  )
}
