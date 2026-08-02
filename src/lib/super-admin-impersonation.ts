// 슈퍼어드민 임퍼소네이션 ("이 길드 어드민으로 보기").
//
// 본 시스템은 별도 서명 쿠키 `super_admin_impersonating` 으로 작동한다 — 세션
// 쿠키의 guildId 를 직접 덮어쓰지 않고, getSessionGuildId() 에서 임퍼소네이션
// 쿠키가 있으면 우선시한다. 슈퍼어드민이 아닌 경우 쿠키는 무시된다 (방어적 검증).
//
// 쿠키 페이로드: { tenantId, startedAt }. HMAC-SHA256 서명, 단명 (1시간 TTL).
// 임퍼소네이션은 의도적으로 짧게 — 잊고 떠나는 사고 방지.

import { cookies } from 'next/headers'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonation,
  type ImpersonationPayload,
} from '@/lib/super-admin-impersonation-token'

export {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_SECONDS,
  impersonationCookieOptions,
  signImpersonation,
  verifyImpersonation,
  type ImpersonationPayload,
} from '@/lib/super-admin-impersonation-token'

export async function getImpersonationFromCookies(): Promise<ImpersonationPayload | null> {
  const store = await cookies()
  return verifyImpersonation(store.get(IMPERSONATION_COOKIE_NAME)?.value)
}
