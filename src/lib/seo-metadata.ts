import { getCanonicalIndexablePathname } from '@/lib/app-route-classification'

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
