// Pure slug validation for tenant subdomains. No DB/env imports so this module
// is safe to import from client components (tenant-resolver.ts pulls in the
// admin Supabase client, which is server-only).

// Subdomains we never hand out as tenant slugs. Onboarding validates against
// this list, and the proxy refuses to treat a reserved subdomain as a tenant.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'auth',
  'admin',
  'onboard',
  'onboarding',
  'status',
  'help',
  'docs',
  'blog',
  'mail',
  'cdn',
  'static',
  'assets',
  'discord',
  'bot',
  'webhook',
  'support',
  'billing',
  'login',
  'signup',
  'pricing',
  'marketing',
  // 내부 경로와 충돌 방지 — slug 가 'events' 면 {slug}.../events 가 모호해짐.
  'events',
  'shop',
  'regear',
  'settings',
  'members',
  'stats',
  'battles',
  'leaderboard',
])

// Validates a user-submitted slug during onboarding.
//   - 2–32 chars, lowercase a–z / 0–9 / hyphen
//   - no leading/trailing hyphen, no consecutive hyphens
//   - not reserved
export function isValidTenantSlug(candidate: string): boolean {
  if (typeof candidate !== 'string') return false
  const s = candidate.toLowerCase()
  if (s.length < 2 || s.length > 32) return false
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) return false
  if (s.includes('--')) return false
  if (RESERVED_SLUGS.has(s)) return false
  return true
}

// Classifies *why* a candidate is invalid — the client uses this to show a
// targeted error message (reserved vs. format vs. length).
export type SlugValidationIssue =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'leading_trailing_hyphen'
  | 'double_hyphen'
  | 'reserved'
  | null

export function classifySlugIssue(candidate: string): SlugValidationIssue {
  if (typeof candidate !== 'string' || candidate.length === 0) return 'empty'
  const s = candidate.toLowerCase()
  if (s.length < 2) return 'too_short'
  if (s.length > 32) return 'too_long'
  if (s.startsWith('-') || s.endsWith('-')) return 'leading_trailing_hyphen'
  if (s.includes('--')) return 'double_hyphen'
  if (!/^[a-z0-9-]+$/.test(s)) return 'invalid_chars'
  if (RESERVED_SLUGS.has(s)) return 'reserved'
  return null
}

// 사이트 좌측 상단/배너 등에 노출할 길드 표시 이름. slug 첫 하이픈 앞부분을
// 떼서 첫 글자만 대문자화한다 ("jelda-pl9c" → "Jelda"). 신규 tenant 의 자동
// slug 는 항상 `<base>-<suffix>` 라 base 가 식별자가 되고, 사용자가 직접
// 정한 slug 도 보통 `이름-임의코드` 형태가 되도록 wizard 에서 안내한다.
//
// hyphen 이 없는 slug 는 통째로 사용 (예: "menhera" → "Menhera").
export function displayNameFromSlug(slug: string): string {
  const base = (slug ?? '').split('-')[0] ?? ''
  if (base.length === 0) return ''
  return base.charAt(0).toUpperCase() + base.slice(1)
}
