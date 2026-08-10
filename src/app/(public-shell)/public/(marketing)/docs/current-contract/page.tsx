import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import {
  Boxes,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Languages,
  PackageCheck,
  PlayCircle,
  Settings2,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'
import DocsMyGuildLink from '@/components/DocsMyGuildLink'
import { SectionCard } from '@/components/ui-patterns'
import { SUPPORTED_LOCALES, getHreflangLocale } from '@/i18n/locales'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import {
  getLocalizedSeoDocsPathname,
  getSeoDocsCanonicalPathname,
  parseSeoDocsPathname,
} from '@/lib/seo-locale-paths'

export const revalidate = 3600

const CONTRACT_ITEMS = [
  { key: 'identity', icon: UserRoundCheck },
  { key: 'events', icon: CalendarCheck },
  { key: 'regear', icon: ShieldCheck },
  { key: 'fulfillment', icon: PackageCheck },
  { key: 'economy', icon: CircleDollarSign },
  { key: 'inboxes', icon: Boxes },
  { key: 'menhera', icon: Eye },
  { key: 'preferences', icon: Languages },
] as const

const FEATURE_STATES = ['disabled', 'setupRequired', 'enabled', 'draining'] as const

function buildCurrentContractAlternates(): Record<string, string> {
  const origin = getCanonicalOrigin()
  const pathname = '/docs/current-contract'
  return {
    'x-default': `${origin}${pathname}`,
    ...Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [
      getHreflangLocale(locale),
      `${origin}${getLocalizedSeoDocsPathname(locale, pathname)}`,
    ])),
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [headerStore, t] = await Promise.all([
    headers(),
    getMarketingTranslator('meta'),
  ])
  const requestPathname = headerStore.get('x-pathname') ?? '/docs/current-contract'
  const canonicalPathname = getSeoDocsCanonicalPathname(requestPathname)
    ?? '/docs/current-contract'
  const parsed = parseSeoDocsPathname(canonicalPathname)
  const canonicalUrl = `${getCanonicalOrigin()}${parsed?.canonicalPathname ?? '/docs/current-contract'}`
  const title = t('currentContractTitle')
  const description = t('currentContractDescription')
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl, languages: buildCurrentContractAlternates() },
    openGraph: { type: 'article', title, description, url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function CurrentProductContractPage() {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicCurrentContract'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)

  return (
    <div className="space-y-9">
      <header className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
          {t('title')}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-gray-300">{t('lead')}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
            {t('scopeBadge')}
          </span>
          <span>{t('updatedAt')}</span>
        </div>
      </header>

      <DocsMyGuildLink />

      <section aria-labelledby="contract-behavior-title" className="space-y-4">
        <div>
          <h2 id="contract-behavior-title" className="text-xl font-black text-white">
            {t('behaviorTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">{t('behaviorLead')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTRACT_ITEMS.map(({ key, icon }) => (
            <SectionCard
              key={key}
              icon={icon}
              tone={key === 'menhera' ? 'info' : 'accent'}
              title={t(`items.${key}.title`)}
              description={t(`items.${key}.body`)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="feature-state-title" className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Settings2 size={20} className="mt-0.5 shrink-0 text-sky-300" />
          <div>
            <h2 id="feature-state-title" className="text-xl font-black text-white">
              {t('featureStatesTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sky-100/75">
              {t('featureStatesLead')}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-2 sm:grid-cols-2">
          {FEATURE_STATES.map((state) => (
            <div key={state} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <dt className="font-mono text-xs font-black uppercase tracking-[0.12em] text-sky-200">
                {t(`states.${state}.label`)}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-gray-300">
                {t(`states.${state}.body`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <h2 className="text-lg font-black text-white">{t('honestyTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/75">{t('honestyBody')}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href={paths.demo}
          className="group rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/5"
        >
          <PlayCircle size={19} className="text-emerald-300" />
          <h2 className="mt-3 font-black text-white group-hover:text-emerald-100">{t('demoCtaTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">{t('demoCtaBody')}</p>
        </Link>
        <Link
          href={paths.guilds}
          className="group rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-colors hover:border-sky-400/40 hover:bg-sky-400/5"
        >
          <ShieldCheck size={19} className="text-sky-300" />
          <h2 className="mt-3 font-black text-white group-hover:text-sky-100">{t('guildsCtaTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">{t('guildsCtaBody')}</p>
        </Link>
      </section>

      <p className="text-xs leading-relaxed text-gray-500">
        {t('detailDocsNote')}{' '}
        <Link href={resolveMarketingHref(paths, '/docs/onboarding')} className="font-semibold text-amber-300 hover:text-amber-200">
          {t('detailDocsLink')}
        </Link>
      </p>
    </div>
  )
}
