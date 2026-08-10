import type { Metadata } from 'next'
import { headers } from 'next/headers'
import MarketingNav from '@/components/MarketingNav'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingTranslator } from '@/lib/marketing-static-intl'
import { buildPublicMarketingMetadata } from '@/lib/seo-metadata'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const [t, headerStore] = await Promise.all([getMarketingTranslator('meta'), headers()])
  return buildPublicMarketingMetadata({
    pathname: headerStore.get('x-pathname') ?? '/terms',
    fallbackPathname: '/terms',
    title: t('termsTitle'),
    description: t('termsDescription'),
  })
}

export default async function PublicTermsPage() {
  const t = await getMarketingTranslator('publicLegal')
  const sectionKeys = [
    'termsBeta',
    'termsAdmin',
    'termsGameData',
    'termsFairUse',
    'termsAvailability',
    'termsChanges',
  ] as const

  return (
    <>
      <MarketingNav />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
          <header className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">
              {t('termsEyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              {t('termsTitle')}
            </h1>
            <p className="text-sm sm:text-base leading-relaxed text-gray-300">
              {t('termsIntro')}
            </p>
          </header>

          <div className="space-y-4">
            {sectionKeys.map((key) => (
              <SectionCard key={key}>
                <h2 className="text-base font-bold text-white">{t(`${key}Title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300 whitespace-pre-line">
                  {t(`${key}Body`)}
                </p>
              </SectionCard>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-gray-500">{t('lastUpdated')}</p>
        </main>
      </div>
    </>
  )
}
