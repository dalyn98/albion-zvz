import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Search, ShieldCheck, Users } from 'lucide-react'
import GuildDirectoryExplorer from '@/components/GuildDirectoryExplorer'
import MarketingNav from '@/components/MarketingNav'
import { SectionCard } from '@/components/ui-patterns'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { loadPublicGuildDirectory } from '@/lib/public-guild-directory-server'
import {
  buildSeoMarketingLanguageAlternates,
  getCanonicalOrigin,
  serializeJsonLd,
} from '@/lib/seo-metadata'
import { getSeoMarketingCanonicalPathname } from '@/lib/seo-locale-paths'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const [headerStore, t] = await Promise.all([
    headers(),
    getMarketingTranslator('meta'),
  ])
  const requestPathname = headerStore.get('x-pathname') ?? '/guilds'
  const canonicalPathname = getSeoMarketingCanonicalPathname(requestPathname) ?? '/guilds'
  const canonicalUrl = `${getCanonicalOrigin()}${canonicalPathname}`
  const title = t('guildDirectoryTitle')
  const description = t('guildDirectoryDescription')
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildSeoMarketingLanguageAlternates(canonicalPathname) ?? undefined,
    },
    openGraph: { type: 'website', title, description, url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicGuildDirectoryPage() {
  const [locale, t, directory] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicGuildDirectory'),
    loadPublicGuildDirectory(),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('title'),
    numberOfItems: directory.entries.length,
    itemListElement: directory.entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      url: `${getCanonicalOrigin()}/g/${encodeURIComponent(entry.slug)}`,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MarketingNav active="guilds" />
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
          <header className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-200">
                <Search size={13} />
                {t('eyebrow')}
              </p>
              <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">
                {t('title')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                {t('lead')}
              </p>
            </div>
            <SectionCard tone="info" className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200">
                <Users size={23} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">{directory.entries.length}</p>
                <p className="text-xs leading-relaxed text-gray-400">{t('publishedCount')}</p>
              </div>
            </SectionCard>
          </header>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100/85">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
            <p className="leading-relaxed">{t('privacyBoundary')}</p>
          </div>

          {!directory.available ? (
            <section role="status" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-5 py-8 text-center">
              <h2 className="font-bold text-amber-100">{t('unavailableTitle')}</h2>
              <p className="mt-2 text-sm text-amber-100/75">{t('unavailableBody')}</p>
            </section>
          ) : (
            <GuildDirectoryExplorer
              entries={directory.entries}
              guildPageBasePath={paths.guildPage}
            />
          )}
        </main>
      </div>
    </>
  )
}
