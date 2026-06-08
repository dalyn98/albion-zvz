import { getCanonicalIndexablePathname } from '@/lib/app-route-classification'
import {
  buildSeoFeatureLanguageAlternates,
  getLocalizedSeoFeaturePathname,
  getSeoFeatureLocale,
} from '@/lib/seo-locale-paths'

export { buildSeoFeatureLanguageAlternates }

const SITE_NAME = 'AlbionGuildManager'
const CANONICAL_ORIGIN = 'https://albion-guildmanager.com'
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh'] as const

export function getCanonicalOrigin(): string {
  return CANONICAL_ORIGIN
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
