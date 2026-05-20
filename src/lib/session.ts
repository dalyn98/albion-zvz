// Signed session cookie for Discord-identified users.
//
// We keep a small JSON payload (Discord ID, display name, avatar, role flags,
// issuedAt) directly in the cookie, HMAC-SHA256 signed with COOKIE_SECRET.
// This avoids a DB/session store and works fine in Edge runtime — same
// shape as the old admin token, just carrying more fields.
//
// Format: `base64url(payloadJson).base64url(signatureBytes)`
//
// 본 모듈은 `cookies()` (next/headers) 를 사용하는 `getSession` 만 따로 보관.
// signSession/verifySession/SessionPayload/SESSION_COOKIE_NAME/cookieOptions 는
// next/headers 의존 없이 동작하므로 `session-verify.ts` 에 분리되어 있다 —
// Middleware/Edge 컨텍스트에서도 안전하게 import 할 수 있도록.

import { cache } from 'react'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, verifySession, type SessionPayload } from './session-verify'
import {
  parseCapabilities,
  hasCapability,
  hasAnyCapability,
  hasAllCapabilities,
} from './permissions'

export {
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
  cookieOptions,
  type SessionPayload,
} from './session-verify'

// Convenience for server components / actions running inside a request.
//
// React cache() 로 per-request 메모이즈 — 같은 render/action invocation 안에서
// 여러 번 호출돼도 HMAC verify 와 세션 디코드는 1회만. 동일 SessionPayload 참조를
// 반환하므로 getSessionGuildId(session) 같은 reference-keyed 캐시도 함께 효과를
//본다. write 경로는 setCookie 후 다음 request 부터 새 cache scope 라 stale 우려 없음.
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE_NAME)?.value)
})

// ─── capability helpers ───────────────────────────────────────
// SessionPayload.capabilities 는 BigInt 직렬화된 string. 라우트별 게이트가
// 매번 BigInt 파싱하지 않게 helper 가 변환을 캡슐화한다. 빈 세션이면 false.
// 점진 마이그 도중에는 호출자가 isAdmin OR capability 두 조건 모두 체크하는
// 패턴이 자연스럽다 — legacy admin 은 ALL_CAPABILITIES 보유라 capability 만
// 으로도 통과하지만, 마이그 안 끝난 라우트의 fallback 으로 isAdmin 도 유지.

export function sessionHas(
  session: SessionPayload | null,
  cap: bigint,
): boolean {
  if (!session) return false
  return hasCapability(parseCapabilities(session.capabilities), cap)
}

export function sessionHasAny(
  session: SessionPayload | null,
  caps: readonly bigint[],
): boolean {
  if (!session) return false
  return hasAnyCapability(parseCapabilities(session.capabilities), caps)
}

export function sessionHasAll(
  session: SessionPayload | null,
  caps: readonly bigint[],
): boolean {
  if (!session) return false
  return hasAllCapabilities(parseCapabilities(session.capabilities), caps)
}
