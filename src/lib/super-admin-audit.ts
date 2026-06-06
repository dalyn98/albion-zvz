// 슈퍼어드민 감사 로그 기록 헬퍼.
//
// 모든 슈퍼어드민 mutation server action 끝에 logSuperAdminAction 을 호출해
// 자동 기록. 페이로드는 자유 형식 jsonb 로, 변경 전/후 값이나 사유 등을 담는다.
// 실패는 로깅만 하고 상위 액션은 깨뜨리지 않는다 (감사 누락 < 기능 차단).

import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

export type SuperAdminAction =
  | 'tenant.status.update'
  | 'tenant.admin.grant'
  | 'tenant.admin.revoke'
  | 'notice.create'
  | 'notice.archive'
  | 'impersonate.start'
  | 'impersonate.end'
  | 'sync.manual'
  | 'user.nickname.update'

export interface AuditEntry {
  superAdminDiscordId: string
  action: SuperAdminAction
  targetTenantId?: string | null
  targetDiscordId?: string | null
  details?: Record<string, unknown>
}

export async function logSuperAdminAction(entry: AuditEntry): Promise<void> {
  try {
    const db = getAdminClient()
    await db.from('super_admin_audit_log').insert({
      super_admin_discord_id: entry.superAdminDiscordId,
      action: entry.action,
      target_tenant_id: entry.targetTenantId ?? null,
      target_discord_id: entry.targetDiscordId ?? null,
      details: entry.details ?? {},
    })
  } catch (err) {
    log.error('[super-admin-audit] failed to write entry', err, {
      action: entry.action,
      target_tenant_id: entry.targetTenantId ?? undefined,
      target_discord_id: entry.targetDiscordId ?? undefined,
    })
  }
}

export interface AuditLogRow {
  id: string
  superAdminDiscordId: string
  action: string
  targetTenantId: string | null
  targetDiscordId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export async function listAuditLog(limit: number = 100): Promise<AuditLogRow[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('super_admin_audit_log')
    .select('id, super_admin_discord_id, action, target_tenant_id, target_discord_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    superAdminDiscordId: r.super_admin_discord_id as string,
    action: r.action as string,
    targetTenantId: (r.target_tenant_id as string | null) ?? null,
    targetDiscordId: (r.target_discord_id as string | null) ?? null,
    details: (r.details as Record<string, unknown> | null) ?? {},
    createdAt: r.created_at as string,
  }))
}
