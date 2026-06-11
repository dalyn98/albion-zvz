import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import { getMarketingTranslator } from '@/lib/marketing-static-intl'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const t = getMarketingTranslator('meta')
  return {
    title: t('privacyTitle'),
    description: t('privacyDescription'),
  }
}

export default async function PublicPrivacyPage() {
  const t = getMarketingTranslator('publicLegal')
  const sectionKeys = [
    'privacyData',
    'privacyUse',
    'privacySharing',
    'privacyRetention',
    'privacyCredentials',
  ] as const

  return (
    <>
      <MarketingNav />
      <div className="min-h-screen bg-[#0b0d12] text-gray-100">
        <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
          <header className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">
              {t('privacyEyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              {t('privacyTitle')}
            </h1>
            <p className="text-sm sm:text-base leading-relaxed text-gray-300">
              {t('privacyIntro')}
            </p>
          </header>

          <div className="space-y-4">
            {sectionKeys.map((key) => (
              <section key={key} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
                <h2 className="text-base font-bold text-white">{t(`${key}Title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300 whitespace-pre-line">
                  {t(`${key}Body`)}
                </p>
              </section>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-gray-500">{t('lastUpdated')}</p>
        </main>
      </div>
    </>
  )
}
