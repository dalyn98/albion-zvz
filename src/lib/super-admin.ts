// Super-admin (개발자) 전용 헬퍼.
//
// 슈퍼어드민은 멀티테넌트 SaaS 운영자 (현재는 본인) 로, 모든 길드/테넌트를
// 가로지르는 관리 권한을 가진다. 일반 admin (tenants.admin_role_ids) 과 구별:
//   - admin: 본인 길드 내 운영 (이벤트/리기어/멤버 관리)
//   - super-admin: 테넌트 자체 관리 (상태/공지/감사) + 모든 테넌트 데이터 조회
//
// 식별: 환경변수 SUPER_ADMIN_DISCORD_IDS 의 콤마 구분 Discord ID 목록.
// 이 변수는 Vercel Production env 에만 두고, 노출 시 즉시 회전.
//
// 세션의 discordId 와 매칭하는 단순 set membership 체크로 충분 — 슈퍼어드민
// 권한은 길드 역할이 아닌 외부 식별자에서 유래하므로 DB 조회가 필요 없다.

import { redirect } from 'next/navigation'
import { getSession, type SessionPayload } from '@/lib/session'

function loadSuperAdminIds(): Set<string> {
  const raw = process.env.SUPER_ADMIN_DISCORD_IDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
}

export function isSuperAdmin(discordId: string | null | undefined): boolean {
  if (!discordId) return false
  return loadSuperAdminIds().has(discordId)
}

export function isSuperAdminSession(session: SessionPayload | null | undefined): boolean {
  if (!session) return false
  return isSuperAdmin(session.discordId)
}

// Server component / action 가드. 통과하면 슈퍼어드민 세션을 반환.
// 실패 시 root 로 리다이렉트 — 슈퍼어드민 페이지 자체의 존재를 노출하지 않기 위해
// /admin 이 아니라 / 로 보낸다.
export async function requireSuperAdmin(): Promise<SessionPayload> {
  const session = await getSession()
  if (!isSuperAdminSession(session)) {
    redirect('/')
  }
  return session as SessionPayload
}
