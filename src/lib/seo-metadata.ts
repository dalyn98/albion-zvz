import type { Metadata } from 'next'
import {
  SUPPORTED_LOCALES,
  getIntlLocale,
  type Locale,
} from '@/i18n/locales'
import { getCanonicalIndexablePathname } from '@/lib/app-route-classification'
import { normalizeGoogleSiteVerificationToken } from '@/lib/google-site-verification'
import {
  buildSeoDocsHomeLanguageAlternates,
  buildSeoFeatureLanguageAlternates,
  buildSeoMarketingLanguageAlternates,
  getLocalizedSeoFeaturePathname,
  getSeoFeatureLocale,
  getSeoMarketingCanonicalPathname,
} from '@/lib/seo-locale-paths'

export {
  buildSeoDocsHomeLanguageAlternates,
  buildSeoFeatureLanguageAlternates,
  buildSeoMarketingLanguageAlternates,
}

const SITE_NAME = 'AlbionGuildManager'
const CANONICAL_ORIGIN = 'https://albion-guildmanager.com'
const SUPPORTED_LANGUAGES = SUPPORTED_LOCALES.map(getIntlLocale)
const ROOT_TITLE = 'AlbionGuildManager — Albion Online 길드 운영 도구'
const ROOT_DESCRIPTION =
  'AlbionGuildManager는 알비온 온라인 길드의 ZvZ 킬보드 추적, 자동 리기어, 길드 상점, 통계·업적까지 한 번에 자동화합니다.'
const ROOT_OG_DESCRIPTION =
  '디스코드 봇으로 시작하는 알비온 길드 운영 자동화 — 킬보드, 자동 리기어, 길드 상점, 통계까지.'
const ROOT_KEYWORDS = [
  'AlbionGuildManager',
  'Albion Guild Manager',
  'Albion Online guild',
  'Albion Online guild manager',
  'Albion ZvZ',
  'Albion killboard',
  'Albion regear',
  'Albion guild bot',
  'Discord guild bot',
]
const ROOT_ICONS: Metadata['icons'] = {
  icon: [
    { url: '/icon.png', sizes: '192x192', type: 'image/png' },
  ],
  apple: [
    { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
  ],
}

export function getCanonicalOrigin(): string {
  return CANONICAL_ORIGIN
}

export function buildCanonicalRootMetadata(
  googleSiteVerificationValue?: string | null,
): Metadata {
  const googleSiteVerification = normalizeGoogleSiteVerificationToken(
    googleSiteVerificationValue,
  )

  return {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
    applicationName: SITE_NAME,
    icons: ROOT_ICONS,
    keywords: ROOT_KEYWORDS,
    robots: { index: true, follow: true },
    ...(googleSiteVerification
      ? { verification: { google: googleSiteVerification } }
      : {}),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: ROOT_TITLE,
      description: ROOT_OG_DESCRIPTION,
      url: CANONICAL_ORIGIN,
    },
    twitter: {
      card: 'summary_large_image',
      title: ROOT_TITLE,
      description: ROOT_OG_DESCRIPTION,
    },
  }
}

export function buildPublicLandingMetadata(
  googleSiteVerificationValue?: string | null,
  localized?: {
    locale: Locale
    pathname?: string
    title: string
    description: string
    openGraphDescription: string
  },
): Metadata {
  const metadata = buildCanonicalRootMetadata(googleSiteVerificationValue)
  const pathname = localized?.pathname
    ? getSeoMarketingCanonicalPathname(localized.pathname) ?? `/${localized.locale}`
    : localized
      ? `/${localized.locale}`
      : '/'
  const canonical = `${CANONICAL_ORIGIN}${pathname === '/' ? '/' : pathname}`
  const title = localized?.title ?? ROOT_TITLE
  const description = localized?.description ?? ROOT_DESCRIPTION
  const openGraphDescription = localized?.openGraphDescription ?? ROOT_OG_DESCRIPTION

  return {
    ...metadata,
    title,
    description,
    alternates: {
      canonical,
      languages: buildSeoMarketingLanguageAlternates(pathname) ?? undefined,
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description: openGraphDescription,
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: openGraphDescription,
    },
  }
}

export function buildPublicMarketingMetadata(input: {
  pathname: string
  fallbackPathname: string
  title: string
  description: string
}): Metadata {
  const canonicalPathname = getSeoMarketingCanonicalPathname(input.pathname)
    ?? input.fallbackPathname
  const canonical = `${CANONICAL_ORIGIN}${canonicalPathname}`
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages: buildSeoMarketingLanguageAlternates(canonicalPathname) ?? undefined,
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
    },
  }
}

export function getCanonicalUrlForPathname(pathname: string): string | null {
  const canonicalPathname = getCanonicalIndexablePathname(pathname)
  if (!canonicalPathname) return null
  return `${getCanonicalOrigin()}${canonicalPathname}`
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

interface RootStructuredDataInput {
  description: string
}

export function buildRootStructuredData({ description }: RootStructuredDataInput): Record<string, unknown> {
  const origin = getCanonicalOrigin()
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: origin,
        logo: `${origin}/icon1.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: SITE_NAME,
        description,
        inLanguage: SUPPORTED_LANGUAGES,
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${origin}/#software`,
        name: SITE_NAME,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: `${origin}/`,
        description,
        inLanguage: SUPPORTED_LANGUAGES,
        publisher: { '@id': `${origin}/#organization` },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
  }
}

export interface FaqStructuredDataItem {
  question: string
  answer: string
}

interface FaqStructuredDataInput {
  items: readonly FaqStructuredDataItem[]
  url: string
}

export function buildFaqStructuredData({
  items,
  url,
}: FaqStructuredDataInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
    url,
  }
}

interface FeaturePageStructuredDataInput {
  title: string
  description: string
  pathname: string
  keywords: readonly string[]
  faqItems?: readonly FaqStructuredDataItem[]
}

export function buildFeaturePageStructuredData({
  title,
  description,
  pathname,
  keywords,
  faqItems = [],
}: FeaturePageStructuredDataInput): Record<string, unknown> {
  const origin = getCanonicalOrigin()
  const url = `${origin}${pathname}`
  const featureLocale = getSeoFeatureLocale(pathname)
  const featureIndexPathname = featureLocale
    ? getLocalizedSeoFeaturePathname(featureLocale, '/features')
    : '/features'
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      keywords,
      isPartOf: { '@id': `${origin}/#website` },
      about: { '@id': `${origin}/#software` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: SITE_NAME,
          item: `${origin}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Features',
          item: `${origin}${featureIndexPathname}`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: title,
          item: url,
        },
      ],
    },
  ]

  if (faqItems.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    })
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
