// 길드 admin (테넌트 본인) 의 mutation 감사 로그 헬퍼.
//
// 슈퍼어드민(`super-admin-audit.ts`) 과 분리된 별도 helper. 길드 admin 은
// 본인 길드 내 운영(이벤트/리기어/멤버/상점) 만 수행하므로 guild_id 격리가
// 필수다. 모든 admin server action 끝에 `logAdminAction` 을 호출해 자동 기록.
//
// 패턴은 super-admin-audit 와 동일: fire-and-forget. 실패는 로깅만 하고 상위
// 액션은 깨뜨리지 않는다 (감사 누락 < 기능 차단).
//
// 사용 예:
//   import { logAdminAction } from '@/lib/admin-audit'
//   // ... event delete server action 내부
//   await logAdminAction({
//     guildId,
//     adminDiscordId: session.discordId,
//     action: 'event.delete',
//     targetId: eventId,
//     targetKind: 'event',
//     details: { eventTitle, eventStartAt },
//   })

import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

// 도메인별 namespace 로 시작하는 식별자. 새 액션 추가 시 여기에 한 줄.
// 자유 텍스트 string 보다 좁혀서 typo/일관성 문제를 컴파일 타임에 잡는다.
export type AdminAction =
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'event.publish'
  | 'event.cancel'
  | 'event.payout.create'
  | 'event.payout.approve'
  | 'event.payout.reject'
  | 'member.role.grant'
  | 'member.role.revoke'
  | 'member.kick'
  | 'points.adjust'
  | 'regear.approve'
  | 'regear.reject'
  | 'regear.bulk_approve'
  | 'regear.bulk_reject'
  | 'exchange.approve'
  | 'exchange.reject'
  | 'role_reward.update'
  | 'shop.item.add'
  | 'shop.item.update'
  | 'shop.item.remove'
  | 'shop.price.update'
  | 'shop.order.approve'
  | 'shop.order.reject'
  | 'donation.approve'
  | 'donation.reject'
  | 'settings.update'
  | 'craft.task.assign'
  | 'craft.task.complete'
  | 'craft.task.cancel'

// target_kind 도 좁혀서 audit 조회 시 안전한 enum 으로 사용.
export type AdminAuditTargetKind =
  | 'event'
  | 'member'
  | 'regear'
  | 'exchange'
  | 'role_reward'
  | 'shop_item'
  | 'shop_order'
  | 'donation'
  | 'craft_task'
  | 'setting'

export interface AdminAuditEntry {
  guildId: string
  adminDiscordId: string
  action: AdminAction
  targetId?: string | null
  targetKind?: AdminAuditTargetKind | null
  targetDiscordId?: string | null
  details?: Record<string, unknown>
}

export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const db = getAdminClient()
    await db.from('admin_audit_log').insert({
      guild_id: entry.guildId,
      admin_discord_id: entry.adminDiscordId,
      action: entry.action,
      target_id: entry.targetId ?? null,
      target_kind: entry.targetKind ?? null,
      target_discord_id: entry.targetDiscordId ?? null,
      details: entry.details ?? {},
    })
  } catch (err) {
    log.error('[admin-audit] failed to write entry', err, {
      guild_id: entry.guildId,
      action: entry.action,
      target_id: entry.targetId ?? undefined,
      target_discord_id: entry.targetDiscordId ?? undefined,
    })
  }
}

export interface AdminAuditLogRow {
  id: string
  guildId: string
  adminDiscordId: string
  action: string
  targetId: string | null
  targetKind: string | null
  targetDiscordId: string | null
  details: Record<string, unknown>
  createdAt: string
}

// 한 길드의 최근 audit 조회. 어드민 페이지의 "활동 로그" 탭에서 사용 예정.
// guild_id 격리는 caller 가 보장 — 이 함수는 service_role 로 직접 쿼리한다.
export async function listAdminAuditLog(
  guildId: string,
  limit: number = 100,
): Promise<AdminAuditLogRow[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('admin_audit_log')
    .select(
      'id, guild_id, admin_discord_id, action, target_id, target_kind, target_discord_id, details, created_at',
    )
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    guildId: r.guild_id as string,
    adminDiscordId: r.admin_discord_id as string,
    action: r.action as string,
    targetId: (r.target_id as string | null) ?? null,
    targetKind: (r.target_kind as string | null) ?? null,
    targetDiscordId: (r.target_discord_id as string | null) ?? null,
    details: (r.details as Record<string, unknown> | null) ?? {},
    createdAt: r.created_at as string,
  }))
}
