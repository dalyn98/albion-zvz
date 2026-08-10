import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Database, Scale, ShieldCheck, Swords } from 'lucide-react'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import {
  buildSeoZvzRecordLanguageAlternates,
  getSeoZvzRecordLocale,
} from '@/lib/seo-locale-paths'
import { PublicZvzRecordChrome, PublicZvzRecordHeader } from '../record-ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [headerStore, t] = await Promise.all([
    headers(),
    getMarketingTranslator('publicZvzRecords'),
  ])
  const requestLocale = getSeoZvzRecordLocale(headerStore.get('x-pathname') ?? '')
  const pathname = `${requestLocale ? `/${requestLocale}` : ''}/zvz-battles/methodology`
  const canonicalUrl = `${getCanonicalOrigin()}${pathname}`
  const title = t('methodologyMetaTitle')
  const description = t('methodologyMetaDescription')
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildSeoZvzRecordLanguageAlternates(pathname) ?? undefined,
    },
    robots: { index: true, follow: true },
    openGraph: { type: 'article', title, description, url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicZvzMethodologyPage() {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const sections = [
    [Database, 'methodologyRawTitle', 'methodologyRawBody'],
    [ShieldCheck, 'methodologyQualifiedTitle', 'methodologyQualifiedBody'],
    [Swords, 'methodologyMatchupTitle', 'methodologyMatchupBody'],
    [Scale, 'methodologyScoreTitle', 'methodologyScoreBody'],
  ] as const
  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader boardHref={paths.zvzBattles} backLabel={t('backToBoard')} eyebrow={t('methodologyEyebrow')} title={t('methodologyTitle')} subtitle={t('methodologyLead')} />
      <section className="grid gap-4 md:grid-cols-2">{sections.map(([Icon, title, body]) => <article key={title} className="rounded-2xl bg-white/[0.035] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]"><Icon className="text-amber-200" size={22} /><h2 className="mt-4 text-lg font-black text-white">{t(title)}</h2><p className="mt-2 text-sm leading-7 text-gray-400">{t(body)}</p></article>)}</section>
      <section className="mt-6 rounded-2xl bg-amber-400/[0.06] p-6 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]"><h2 className="font-black text-amber-100">{t('methodologyLimitsTitle')}</h2><p className="mt-2 text-sm leading-7 text-amber-50/70">{t('methodologyLimitsBody')}</p></section>
    </PublicZvzRecordChrome>
  )
}
