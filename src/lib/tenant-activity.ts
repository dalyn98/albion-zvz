import { getAdminClient } from '@/lib/supabase-admin'

// 어드민 OAuth 로그인 시점에 호출 — 슈퍼어드민 UI 에서 무활동 테넌트(30일+)
// 를 식별하는 신호. 자체 실패는 swallow 한다 — 통계 갱신 한 번 빠지는 것보다
// 어드민 로그인 흐름 자체를 막는 비용이 훨씬 크다.
export async function recordAdminLogin(tenantId: string): Promise<void> {
  if (!tenantId) return
  const db = getAdminClient()
  const { error } = await db
    .from('tenants')
    .update({ last_admin_login_at: new Date().toISOString() })
    .eq('id', tenantId)
  if (error) {
    console.error('[recordAdminLogin] update failed', { tenantId, error })
  }
}
