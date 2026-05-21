// Host-aware path helpers for marketing pages. features/pricing 는 /landing 의
// anchor 로 노출된다 (전용 라우트는 redirect-only 로 보존돼 기존 인바운드 링크가
// 안 깨진다). FAQ 는 별도 페이지로 분리되어 /faq 에서 노출된다.
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
  faq: string
  // docs 는 단일 prefix. nested 페이지는 `${paths.docs}/onboarding` 처럼 조합.
  docs: string
  // 길드 공개 페이지 prefix. 실제 링크는 `${paths.guildPage}/<slug>` 로 합성.
  guildPage: string
}

const CANONICAL_PATHS: MarketingPaths = {
  home: '/',
  features: '/#features',
  faq: '/faq',
  docs: '/docs',
  guildPage: '/g',
}

const PUBLIC_PATHS: MarketingPaths = {
  home: '/public/landing',
  features: '/public/landing#features',
  faq: '/public/faq',
  docs: '/public/docs',
  guildPage: '/public/g',
}

function buildRootAbsolutePaths(rootDomain: string): MarketingPaths {
  const origin = `https://${rootDomain}`
  return {
    home: `${origin}/`,
    features: `${origin}/#features`,
    faq: `${origin}/faq`,
    docs: `${origin}/docs`,
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

export async function getMarketingPaths(): Promise<MarketingPaths> {
  const headersList = await headers()
  return getMarketingPathsForHost(headersList.get('host'))
}
