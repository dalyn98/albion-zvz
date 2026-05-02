// `lang` 쿠키 옵션 헬퍼. 세션 쿠키와 다르게 도메인 단위로 공유한다 — 캐노니컬
// (`albion-guildmanager.com`) 마케팅 페이지에서 언어를 바꾸면 모든 테넌트
// 서브도메인 (`<slug>.albion-guildmanager.com`) 에서 즉시 반영되어야 한다.
// 사용자 입장에서 언어 선택은 테넌트별이 아니라 본인 preference.
//
// 세션 쿠키는 의도적으로 per-subdomain (anti-replay) — 그쪽은 그대로 둔다.
//
// localhost / vercel preview 에서는 domain 미설정 (실도메인 필요).

import { getCanonicalRootDomain } from '@/lib/tenant-resolver'

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function getLocaleCookieDomain(host: string | null | undefined): string | undefined {
  if (!host) return undefined
  const h = host.split(':')[0].toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app')) return undefined
  const root = getCanonicalRootDomain()
  if (h === root || h.endsWith('.' + root)) return '.' + root
  return undefined
}

export function localeCookieOptions(host: string | null | undefined) {
  const domain = getLocaleCookieDomain(host)
  return {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax' as const,
    ...(domain ? { domain } : {}),
  }
}
