// Cookie-free session primitives.
//
// `session.ts` 가 `cookies()` (next/headers) 를 사용하기 때문에 Middleware
// (proxy.ts) 와 Edge 컨텍스트에서 import 하면 모듈 그래프에 next/headers 가
// 끌려와 빌드가 깨진다. signSession/verifySession/SessionPayload/cookieOptions
// 자체는 cookies() 를 호출하지 않으므로 별도 모듈로 분리해서 양쪽이 안전하게
// 쓸 수 있게 한다. session.ts 는 본 모듈을 re-export 하고 getSession 만 추가.

import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export const SESSION_COOKIE_NAME = 'user_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface SessionPayload {
  discordId: string
  username: string
  avatar: string | null
  isMember: boolean
  isAdmin: boolean
  isGuest: boolean
  // Guild-local Albion account. It is not a Discord identity and is restricted
  // by layout/sidebar guards to event signup and regear request flows.
  isLocalGuildAccount: boolean
  // Admin 이거나 app_setting 의 event_creator_role_ids 중 하나를 가진 구성원.
  // 로그인 시점에 계산되므로 역할 리스트 변경은 재로그인 후 반영된다.
  canCreateEvents: boolean
  // 이벤트 카테고리별 생성 권한. admin 은 항상 모든 카테고리. 일반 멤버는
  // event_creator_role_ids_{combat|ff|ganking} 중 하나라도 보유하면 그 카테고리만
  // 활성. legacy `event_creator_role_ids` 가 채워져 있으면 모든 카테고리에 추가
  // 부여 (backward-compat). 세션 발급 시점의 snapshot 이라 변경은 재로그인 후 반영.
  eventCreatorCategories: EventCategory[]
  // 이벤트별 게스트 초대 링크로 로그인한 경우 해당 event_id. layout 이 이 값을
  // 보고 `/events/{eventScope}` 외 모든 경로를 redirect 로 차단한다. member/
  // admin 세션은 null (전체 접근).
  eventScope: string | null
  // Multi-tenant 테넌트 UUID. 로그인 시점에 Discord 길드 → tenants 조회로 결정.
  // 레거시 쿠키(Phase 1 이전 발급)는 null 이며, 이 경우 소비 측에서 primary
  // tenant 로 fallback 한다 (src/lib/tenant.ts:getSessionGuildId).
  guildId: string | null
  // Granular capability 비트필드 (BigInt → base-10 string 으로 직렬화).
  // isAdmin 인 세션은 ALL_CAPABILITIES, 일반 멤버는 role grant + override 합산
  // 결과. 레거시 쿠키는 빈 문자열 또는 누락 → 코드 측 helper 에서 0n fallback.
  // 점진 마이그를 위해 기존 isAdmin/canCreateEvents/eventCreatorCategories 와
  // 공존 — 검증은 `sessionHas(session, CAP.X)` 헬퍼로 (src/lib/session.ts).
  capabilities: string
  issuedAt: number
}

function normalizeCategories(raw: unknown): EventCategory[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<EventCategory>()
  for (const v of raw) {
    if (typeof v === 'string' && (EVENT_CATEGORIES as readonly string[]).includes(v)) {
      seen.add(v as EventCategory)
    }
  }
  return Array.from(seen)
}

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const binary = atob(padded)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getSigningKey()
  const json = JSON.stringify(payload)
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(json))
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${base64UrlEncode(sig)}`
}

export async function verifySession(cookieValue: string | undefined): Promise<SessionPayload | null> {
  if (!cookieValue) return null
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  try {
    const key = await getSigningKey()
    const sig = base64UrlDecode(sigB64)
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sig,
      new TextEncoder().encode(payloadB64),
    )
    if (!ok) return null
    const json = new TextDecoder().decode(base64UrlDecode(payloadB64))
    const parsed = JSON.parse(json) as Partial<SessionPayload> & { issuedAt: number }
    // Expire server-side too — cookie maxAge is client hint, not enforcement.
    const ageSeconds = (Date.now() - parsed.issuedAt) / 1000
    if (ageSeconds > SESSION_MAX_AGE_SECONDS) return null
    // Legacy cookies issued before isGuest / canCreateEvents were added default
    // to safe values — admins always retain the capability so their old
    // sessions keep working without forcing a re-login.
    const isAdmin = parsed.isAdmin ?? false
    const canCreateEvents = parsed.canCreateEvents ?? isAdmin
    // 레거시 쿠키(eventCreatorCategories 도입 이전) 는 canCreateEvents 의 boolean
    // 만 가지고 있다 — true 면 모든 카테고리 허용, false 면 빈 배열.
    const normalizedCategories = normalizeCategories(parsed.eventCreatorCategories)
    const eventCreatorCategories =
      normalizedCategories.length > 0
        ? normalizedCategories
        : canCreateEvents
          ? ([...EVENT_CATEGORIES] as EventCategory[])
          : []
    return {
      discordId: parsed.discordId ?? '',
      username: parsed.username ?? '',
      avatar: parsed.avatar ?? null,
      isMember: parsed.isMember ?? false,
      isAdmin,
      isGuest: parsed.isGuest ?? false,
      isLocalGuildAccount: parsed.isLocalGuildAccount ?? false,
      canCreateEvents,
      eventCreatorCategories,
      // 레거시 쿠키(eventScope 도입 이전) 는 undefined → null 로 정규화.
      eventScope: parsed.eventScope ?? null,
      // 레거시 쿠키(guildId 도입 이전) 는 null. 소비 측에서 primary tenant 로 fallback.
      guildId: parsed.guildId ?? null,
      // 레거시 쿠키 (capabilities 도입 이전) 는 빈 문자열. 일반 멤버는 0n 으로
      // 파싱되고, admin 은 sessionHas* helper 의 isAdmin fallback 으로 모든
      // capability gate 를 통과한다. 재로그인 시 OAuth callback 에서
      // resolveUserCapabilities 가 갱신.
      capabilities: typeof parsed.capabilities === 'string' ? parsed.capabilities : '',
      issuedAt: parsed.issuedAt,
    }
  } catch {
    return null
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  }
}
