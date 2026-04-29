// Host-aware path helpers for marketing pages. /landing 한 페이지로 통합돼서
// features/pricing/faq 는 /landing 의 anchor 로만 노출된다 (전용 라우트는
// redirect-only 로 보존돼 기존 인바운드 링크가 안 깨진다).
//
// canonical 도메인(`albion-guildmanager.com`) 에서는 proxy 가 깔끔한 canonical
// path 를 내부 `/public/*` 로 rewrite 하지만, 테넌트 서브도메인
// (`{slug}.albion-guildmanager.com`) 이나 preview/localhost 에서는 같은 path 가
// rewrite 되지 않아 AppGate 로 떨어진다.
//
// 마케팅 페이지(/public/* 직접) 는 어떤 호스트에서도 layout 의 isPublic 분기로
// 정상 표시되므로, MarketingNav/MarketingFooter/페이지 내부 cross-link 는 호스트
// 에 따라 canonical 또는 `/public/*` path 중 통하는 쪽을 골라 써야 한다.

import { headers } from 'next/headers'
import { classifyHost } from '@/lib/tenant-resolver'

export interface MarketingPaths {
  home: string
  features: string
  pricing: string
  faq: string
  // docs 는 단일 prefix. nested 페이지는 `${paths.docs}/onboarding` 처럼 조합.
  docs: string
}

const CANONICAL_PATHS: MarketingPaths = {
  home: '/',
  features: '/#features',
  pricing: '/#pricing',
  faq: '/#faq',
  docs: '/docs',
}

const PUBLIC_PATHS: MarketingPaths = {
  home: '/public/landing',
  features: '/public/landing#features',
  pricing: '/public/landing#pricing',
  faq: '/public/landing#faq',
  docs: '/public/docs',
}

// Returns the canonical short paths only when we're actually on the canonical
// root host; everywhere else falls back to `/public/*` direct paths so the
// links keep working on tenant subdomains, previews, and localhost.
export async function getMarketingPaths(): Promise<MarketingPaths> {
  const headersList = await headers()
  const classification = classifyHost(headersList.get('host'))
  return classification.kind === 'root' ? CANONICAL_PATHS : PUBLIC_PATHS
}
