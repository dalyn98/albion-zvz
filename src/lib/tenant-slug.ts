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

// 알비온 길드명에서 slug base 를 추출한다. 비ASCII (한글/한자) 는 DNS 호스트명에
// 못 들어가므로 제거되고, 그래서 한글 길드명은 빈 문자열이 나올 수 있다 — 호출부
// 에서 isValidTenantSlug 로 결과 후처리하고 폴백 할 것.
//
// suffix 는 붙이지 않는다 — 호출부의 findUniqueSlug 가 충돌 검사 후 suffix 를
// 결정한다. bot-callback 의 slugifyGuildName(name) 은 항상 base+suffix 형태로
// 즉시 INSERT 시도가 목적이라 별도. 두 함수의 base 추출 로직은 동일하게 유지.
export function slugBaseFromAlbionGuildName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}
