import type { Metadata } from 'next'
import { HelpCircle } from 'lucide-react'
import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import {
  buildFaqStructuredData,
  getCanonicalOrigin,
  serializeJsonLd,
} from '@/lib/seo-metadata'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('meta')
  return {
    title: t('faqTitle'),
    description: t('faqDescription'),
    openGraph: {
      type: 'website',
      title: t('faqTitle'),
      description: t('faqDescription'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('faqTitle'),
      description: t('faqDescription'),
    },
  }
}

const FAQ_KEYS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6',
  'q7', 'q8', 'q9', 'q10', 'q11', 'q12',
  'q13', 'q14', 'q15', 'q16', 'q17', 'q18',
] as const
type FaqKey = (typeof FAQ_KEYS)[number]
type FaqAnswerKey =
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'
  | 'a7' | 'a8' | 'a9' | 'a10' | 'a11' | 'a12'
  | 'a13' | 'a14' | 'a15' | 'a16' | 'a17' | 'a18'
const FAQ_ANSWER_KEY: Record<FaqKey, FaqAnswerKey> = {
  q1: 'a1', q2: 'a2', q3: 'a3', q4: 'a4', q5: 'a5', q6: 'a6',
  q7: 'a7', q8: 'a8', q9: 'a9', q10: 'a10', q11: 'a11', q12: 'a12',
  q13: 'a13', q14: 'a14', q15: 'a15', q16: 'a16', q17: 'a17', q18: 'a18',
}

export default async function PublicFaqPage({
  searchParams,
}: {
  searchParams: Promise<{ entry_error?: string | string[] }>
}) {
  const [params, locale, tFaq] = await Promise.all([
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicFaq'),
  ])
  const entryError = Array.isArray(params.entry_error)
    ? params.entry_error[0]
    : params.entry_error
  const paths = getMarketingPathsForEnvironment(locale)
  const faqStructuredData = buildFaqStructuredData({
    url: `${getCanonicalOrigin()}/faq`,
    items: FAQ_KEYS.map((qKey) => ({
      question: tFaq(qKey),
      answer: tFaq(FAQ_ANSWER_KEY[qKey]),
    })),
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqStructuredData) }}
      />
      <MarketingNav active="faq" />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
          <div className="text-center space-y-3">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {tFaq('pageSubtitle')}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              {tFaq('pageTitle')}
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-300">
              {tFaq('pageLead')}
            </p>
          </div>

          {entryError === 'discord_link_invalid' && (
            <p
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100"
            >
              {tFaq('entryErrorDiscordLinkInvalid')}
            </p>
          )}

          <div className="space-y-3">
            {FAQ_KEYS.map((qKey) => (
              <details
                key={qKey}
                className="group rounded-xl border border-border bg-surface px-5 py-4 shadow-card open:bg-surface-2"
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
                <p className="mt-3 ml-7 text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                  {tFaq(FAQ_ANSWER_KEY[qKey])}
                </p>
              </details>
            ))}
          </div>

          <SectionCard tone="accent" className="space-y-3 text-center">
            <h2 className="text-lg font-bold text-white">{tFaq('ctaTitle')}</h2>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-amber-100/80">
              {tFaq('ctaBody')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
              <Link
                href={paths.docs}
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                {tFaq('ctaDocs')}
              </Link>
              <Link
                href={paths.demo}
                className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900/80 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                {tFaq('ctaDemo')}
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  )
}
