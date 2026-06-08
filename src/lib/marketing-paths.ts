// Host-aware path helpers for marketing pages. features/pricing/FAQ/legal/docs 는
// 별도 canonical 페이지로 분리된다.
//
// 공식 사이트는 항상 canonical root (`albion-guildmanager.com`) 로 열려야 한다.
// 테넌트 서브도메인에서 AGM 공식 사이트 링크를 눌러도 `{slug}.…/public/landing`
// 에 머물면 공유 URL 이 길드 컨텍스트를 띠게 되므로, tenant host 에서는 root
// 절대 URL 을 반환한다. preview/localhost 는 로컬 검증을 위해 `/public/*` 유지.

import { headers } from 'next/headers'
import { classifyHost, getCanonicalRootDomain } from '@/lib/tenant-resolver'

export interface MarketingPaths {
  home: string
  features: string
  pricing: string
  faq: string
  // docs 는 단일 prefix. nested 페이지는 `${paths.docs}/onboarding` 처럼 조합.
  docs: string
  demo: string
  privacy: string
  terms: string
  // 길드 공개 페이지 prefix. 실제 링크는 `${paths.guildPage}/<slug>` 로 합성.
  guildPage: string
}

const CANONICAL_PATHS: MarketingPaths = {
  home: '/',
  features: '/features',
  pricing: '/pricing',
  faq: '/faq',
  docs: '/docs',
  demo: '/demo',
  privacy: '/privacy',
  terms: '/terms',
  guildPage: '/g',
}

const PUBLIC_PATHS: MarketingPaths = {
  home: '/public/landing',
  features: '/public/features',
  pricing: '/public/pricing',
  faq: '/public/faq',
  docs: '/public/docs',
  demo: '/demo',
  privacy: '/public/privacy',
  terms: '/public/terms',
  guildPage: '/public/g',
}

function buildRootAbsolutePaths(rootDomain: string): MarketingPaths {
  const origin = `https://${rootDomain}`
  return {
    home: `${origin}/`,
    features: `${origin}/features`,
    pricing: `${origin}/pricing`,
    faq: `${origin}/faq`,
    docs: `${origin}/docs`,
    demo: `${origin}/demo`,
    privacy: `${origin}/privacy`,
    terms: `${origin}/terms`,
    guildPage: `${origin}/g`,
  }
}

export function getMarketingPathsForHost(hostHeader: string | null | undefined): MarketingPaths {
  const classification = classifyHost(hostHeader)
  if (classification.kind === 'root') return CANONICAL_PATHS
  if (classification.kind === 'tenant') {
    return buildRootAbsolutePaths(getCanonicalRootDomain())
  }
  return PUBLIC_PATHS
}

export function resolveMarketingHref(paths: MarketingPaths, href: string): string {
  if (!href.startsWith('/')) return href

  if (href === '/') return paths.home
  if (href === '/#features' || href === '/features') return paths.features
  if (href.startsWith('/features/')) return `${paths.features}${href.slice('/features'.length)}`
  if (href === '/pricing') return paths.pricing
  if (href === '/faq') return paths.faq
  if (href === '/docs') return paths.docs
  if (href.startsWith('/docs/')) return `${paths.docs}${href.slice('/docs'.length)}`
  if (href === '/privacy') return paths.privacy
  if (href === '/terms') return paths.terms
  if (href === '/demo') return paths.demo
  if (href === '/g') return paths.guildPage
  if (href.startsWith('/g/')) return `${paths.guildPage}${href.slice('/g'.length)}`

  return href
}

export async function getMarketingPaths(): Promise<MarketingPaths> {
  const headersList = await headers()
  return getMarketingPathsForHost(headersList.get('host'))
}
