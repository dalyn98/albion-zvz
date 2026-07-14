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

// 도메인별 namespace 로 시작하는 식별자. 새 액션 추가 시 ADMIN_ACTIONS 에 한 줄
// — `as const` 로 union 타입과 런타임 array 가 한 곳에서 파생되도록 묶었다.
// audit 페이지의 필터 드롭다운이 런타임 array 를 필요로 한다.
export const ADMIN_ACTIONS = [
  'event.create',
  'event.update',
  'event.delete',
  'event.publish',
  'event.cancel',
  'event.payout.create',
  'event.payout.approve',
  'event.payout.reject',
  'member.role.grant',
  'member.role.revoke',
  'member.kick',
  'points.adjust',
  'regear.approve',
  'regear.reject',
  'regear.bulk_approve',
  'regear.bulk_reject',
  'exchange.approve',
  'exchange.reject',
  'role_reward.update',
  'role_reward.delete',
  'shop.item.add',
  'shop.item.update',
  'shop.item.remove',
  'shop.price.update',
  'shop.order.approve',
  'shop.order.reject',
  'member_trade.dispute.resolve',
  'donation.approve',
  'donation.reject',
  'settings.update',
  'craft.task.assign',
  'craft.task.complete',
  'craft.task.cancel',
  'craft.reimbursement.approve',
  'craft.reimbursement.reject',
  'permission.role.update',
  'permission.role.delete',
  'permission.user.update',
  'permission.user.delete',
  'siphon.log.import',
  'siphon.log.delete',
  'siphon.log.reset',
  'loot_audit.create',
  'loot_audit.finding.resolve',
  'battle.activity_override.update',
  'battle.activity_override.reset',
  'alliance_content.session.confirm',
  'alliance_content.battle.exclude',
  'alliance_content.video.approve',
  'alliance_content.video.reject',
  'alliance_content.policy.update',
  'alliance_content.participation.add',
] as const

export type AdminAction = (typeof ADMIN_ACTIONS)[number]

// target_kind 도 좁혀서 audit 조회 시 안전한 enum 으로 사용.
export const ADMIN_AUDIT_TARGET_KINDS = [
  'event',
  'member',
  'regear',
  'exchange',
  'role_reward',
  'shop_item',
  'shop_order',
  'member_trade_order',
  'donation',
  'craft_task',
  'setting',
  'permission_role',
  'permission_user',
  'siphon_ledger',
  'loot_audit',
  'loot_audit_finding',
  'battle',
  'alliance_content_session',
  'alliance_content_video_submission',
  'alliance_content_policy',
] as const

export type AdminAuditTargetKind = (typeof ADMIN_AUDIT_TARGET_KINDS)[number]

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

export interface ListAdminAuditLogFilters {
  action?: AdminAction
  adminDiscordId?: string
  targetKind?: AdminAuditTargetKind
  targetDiscordId?: string
  // ISO datetime strings — inclusive lower / upper bound on created_at.
  from?: string
  to?: string
}

export interface ListAdminAuditLogOptions {
  filters?: ListAdminAuditLogFilters
  limit?: number
  offset?: number
}

export interface ListAdminAuditLogResult {
  rows: AdminAuditLogRow[]
  total: number
  limit: number
  offset: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// 한 길드의 audit 로그 조회 — 어드민 대시보드 "감사 로그" 페이지에서 사용.
// guild_id 격리는 시그니처에 강제 (caller 가 본인 길드 id 만 넘긴다는 가정).
// 필터/페이지네이션 + total count 같이 반환해 UI 가 페이지 컨트롤을 그릴 수 있게.
export async function listAdminAuditLog(
  guildId: string,
  options: ListAdminAuditLogOptions = {},
): Promise<ListAdminAuditLogResult> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT)
  const offset = Math.max(0, options.offset ?? 0)
  const filters = options.filters ?? {}

  const db = getAdminClient()
  let q = db
    .from('admin_audit_log')
    .select(
      'id, guild_id, admin_discord_id, action, target_id, target_kind, target_discord_id, details, created_at',
      { count: 'exact' },
    )
    .eq('guild_id', guildId)
  if (filters.action) q = q.eq('action', filters.action)
  if (filters.adminDiscordId) q = q.eq('admin_discord_id', filters.adminDiscordId)
  if (filters.targetKind) q = q.eq('target_kind', filters.targetKind)
  if (filters.targetDiscordId) q = q.eq('target_discord_id', filters.targetDiscordId)
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to) q = q.lte('created_at', filters.to)
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) throw new Error(error.message)

  const rows: AdminAuditLogRow[] = (data ?? []).map((r) => ({
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

  return { rows, total: count ?? 0, limit, offset }
}
