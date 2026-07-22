// 데모 감사 로그 시드 — /demo/audit 페이지에서 사용.
// 실제 `admin_audit_log` 테이블 스키마 (AdminAuditLogRow) 와 동일한 모양.
// 시각은 `day + time` 으로 보관 → 페이지 렌더 시점에 ISO 로 풀어 항상 "최근" 으로
// 보이게 한다. 사용자명 매핑도 인메모리로 제공해 실제 어드민 페이지의
// `getUsernamesByDiscordIds` 와 동등한 인터페이스 유지.

import type { AdminAuditLogRow } from '@/lib/admin-audit'
import type { DemoRelativeDay } from './shared'

const DEMO_GUILD_ID = 'demo-guild'

const DAY_OFFSET: Record<DemoRelativeDay, number> = {
  today: 0,
  yesterday: -1,
  tomorrow: 1,
  d2ago: -2,
  d3ago: -3,
  d4ago: -4,
  d5ago: -5,
}

type AuditSeedEntry = {
  id: string
  adminDiscordId: string
  action: string
  targetId: string | null
  targetKind: string | null
  targetDiscordId: string | null
  details: Record<string, unknown>
  day: DemoRelativeDay
  time: string // 'HH:MM:SS' (UTC, 렌더 시 테넌트 tz 로 변환)
}

const ENTRIES: AuditSeedEntry[] = [
  {
    id: 'audit-001',
    adminDiscordId: 'demo-eternia',
    action: 'event.create',
    targetId: 'evt-spring-zvz',
    targetKind: 'event',
    targetDiscordId: null,
    details: { title: 'Spring Crystal Push', startAt: '20:00' },
    day: 'today',
    time: '14:02:18',
  },
  {
    id: 'audit-002',
    adminDiscordId: 'demo-daewi',
    action: 'event.publish',
    targetId: 'evt-spring-zvz',
    targetKind: 'event',
    targetDiscordId: null,
    details: { announceChannel: 'general' },
    day: 'today',
    time: '14:05:42',
  },
  {
    id: 'audit-003',
    adminDiscordId: 'demo-eternia',
    action: 'regear.approve',
    targetId: 'regear-301',
    targetKind: 'regear',
    targetDiscordId: 'demo-shadowace',
    details: { silver: 612_000, slots: 7 },
    day: 'today',
    time: '13:48:09',
  },
  {
    id: 'audit-004',
    adminDiscordId: 'demo-eternia',
    action: 'regear.reject',
    targetId: 'regear-298',
    targetKind: 'regear',
    targetDiscordId: 'demo-vexa',
    details: { reason: 'redzone, policy = blackzone only' },
    day: 'today',
    time: '13:46:11',
  },
  {
    id: 'audit-005',
    adminDiscordId: 'demo-daewi',
    action: 'regear.bulk_approve',
    targetId: null,
    targetKind: 'regear',
    targetDiscordId: null,
    details: { count: 12, totalSilver: 4_820_000 },
    day: 'today',
    time: '13:30:55',
  },
  {
    id: 'audit-006',
    adminDiscordId: 'demo-eternia',
    action: 'exchange.approve',
    targetId: 'ex-1',
    targetKind: 'exchange',
    targetDiscordId: 'demo-shadowace',
    details: { points: 800, silver: 800_000, ratePercent: 100 },
    day: 'today',
    time: '12:34:02',
  },
  {
    id: 'audit-007',
    adminDiscordId: 'demo-daewi',
    action: 'donation.approve',
    targetId: 'dn-1',
    targetKind: 'donation',
    targetDiscordId: 'demo-daewi',
    details: { silver: 5_000_000, points: 5_000, note: '주간 길드 운영자금' },
    day: 'today',
    time: '11:18:33',
  },
  {
    id: 'audit-008',
    adminDiscordId: 'demo-eternia',
    action: 'shop.item.add',
    targetId: 'shop-item-12',
    targetKind: 'shop_item',
    targetDiscordId: null,
    details: { name: 'T8 Bloodletter', stock: 4, points: 480 },
    day: 'today',
    time: '10:55:47',
  },
  {
    id: 'audit-009',
    adminDiscordId: 'demo-eternia',
    action: 'shop.price.update',
    targetId: null,
    targetKind: 'setting',
    targetDiscordId: null,
    details: { ratePercent: 90, previous: 100 },
    day: 'today',
    time: '10:12:08',
  },
  {
    id: 'audit-010',
    adminDiscordId: 'demo-daewi',
    action: 'shop.order.approve',
    targetId: 'shop-order-44',
    targetKind: 'shop_order',
    targetDiscordId: 'demo-mochi',
    details: { item: 'T7 Great Holy Staff', points: 300 },
    day: 'yesterday',
    time: '23:41:19',
  },
  {
    id: 'audit-011',
    adminDiscordId: 'demo-eternia',
    action: 'member.role.grant',
    targetId: null,
    targetKind: 'member',
    targetDiscordId: 'demo-daewi',
    details: { role: 'caller' },
    day: 'yesterday',
    time: '22:08:54',
  },
  {
    id: 'audit-012',
    adminDiscordId: 'demo-eternia',
    action: 'event.payout.create',
    targetId: 'evt-night-zvz-2',
    targetKind: 'event',
    targetDiscordId: null,
    details: { attendees: 18, pointsPerHead: 200 },
    day: 'yesterday',
    time: '21:46:30',
  },
  {
    id: 'audit-013',
    adminDiscordId: 'demo-daewi',
    action: 'event.payout.approve',
    targetId: 'evt-night-zvz-2',
    targetKind: 'event',
    targetDiscordId: null,
    details: { attendees: 18, totalPoints: 3_600 },
    day: 'yesterday',
    time: '21:52:11',
  },
  {
    id: 'audit-014',
    adminDiscordId: 'demo-daewi',
    action: 'points.adjust',
    targetId: null,
    targetKind: 'member',
    targetDiscordId: 'demo-mochi',
    details: { delta: -500, reason: '환전 정정' },
    day: 'yesterday',
    time: '20:31:22',
  },
  {
    id: 'audit-015',
    adminDiscordId: 'demo-eternia',
    action: 'role_reward.update',
    targetId: null,
    targetKind: 'role_reward',
    targetDiscordId: null,
    details: { role: 'caller', weeklyPoints: 300, previous: 250 },
    day: 'yesterday',
    time: '19:47:50',
  },
  {
    id: 'audit-016',
    adminDiscordId: 'demo-daewi',
    action: 'exchange.reject',
    targetId: 'ex-7',
    targetKind: 'exchange',
    targetDiscordId: 'demo-vexa',
    details: { reason: '포인트 잔액 부족' },
    day: 'yesterday',
    time: '18:14:09',
  },
  {
    id: 'audit-017',
    adminDiscordId: 'demo-eternia',
    action: 'craft.task.assign',
    targetId: 'craft-task-7',
    targetKind: 'craft_task',
    targetDiscordId: 'demo-borin',
    details: { item: 'T8 Bloodletter ×4', deadline: '+3d' },
    day: 'yesterday',
    time: '17:02:48',
  },
  {
    id: 'audit-018',
    adminDiscordId: 'demo-daewi',
    action: 'craft.task.complete',
    targetId: 'craft-task-3',
    targetKind: 'craft_task',
    targetDiscordId: 'demo-borin',
    details: { item: 'T7 Heavy Mace ×6', payout: 1_200 },
    day: 'd2ago',
    time: '22:18:32',
  },
  {
    id: 'audit-019',
    adminDiscordId: 'demo-eternia',
    action: 'settings.update',
    targetId: null,
    targetKind: 'setting',
    targetDiscordId: null,
    details: { key: 'autoRegear', value: true, previous: false },
    day: 'd2ago',
    time: '20:55:16',
  },
  {
    id: 'audit-020',
    adminDiscordId: 'demo-eternia',
    action: 'event.update',
    targetId: 'evt-spring-zvz',
    targetKind: 'event',
    targetDiscordId: null,
    details: { field: 'startAt', from: '21:00', to: '20:00' },
    day: 'd2ago',
    time: '19:42:01',
  },
  {
    id: 'audit-021',
    adminDiscordId: 'demo-daewi',
    action: 'regear.bulk_reject',
    targetId: null,
    targetKind: 'regear',
    targetDiscordId: null,
    details: { count: 4, reason: 'redzone, policy' },
    day: 'd2ago',
    time: '18:21:48',
  },
  {
    id: 'audit-022',
    adminDiscordId: 'demo-eternia',
    action: 'member.kick',
    targetId: null,
    targetKind: 'member',
    targetDiscordId: 'demo-quiet-mage',
    details: { reason: '30일 미접속' },
    day: 'd2ago',
    time: '15:11:07',
  },
  {
    id: 'audit-023',
    adminDiscordId: 'demo-eternia',
    action: 'shop.item.update',
    targetId: 'shop-item-9',
    targetKind: 'shop_item',
    targetDiscordId: null,
    details: { field: 'stock', from: 0, to: 6 },
    day: 'd3ago',
    time: '22:39:25',
  },
  {
    id: 'audit-024',
    adminDiscordId: 'demo-daewi',
    action: 'shop.order.reject',
    targetId: 'shop-order-41',
    targetKind: 'shop_order',
    targetDiscordId: 'demo-nebulaq',
    details: { reason: '재고 없음' },
    day: 'd3ago',
    time: '21:08:14',
  },
  {
    id: 'audit-025',
    adminDiscordId: 'demo-eternia',
    action: 'member.role.revoke',
    targetId: null,
    targetKind: 'member',
    targetDiscordId: 'demo-shadowace',
    details: { role: 'intern' },
    day: 'd3ago',
    time: '19:54:33',
  },
  {
    id: 'audit-026',
    adminDiscordId: 'demo-eternia',
    action: 'craft.task.cancel',
    targetId: 'craft-task-9',
    targetKind: 'craft_task',
    targetDiscordId: 'demo-borin',
    details: { reason: '자재 부족' },
    day: 'd3ago',
    time: '17:42:00',
  },
  {
    id: 'audit-027',
    adminDiscordId: 'demo-daewi',
    action: 'donation.reject',
    targetId: 'dn-8',
    targetKind: 'donation',
    targetDiscordId: 'demo-lumina',
    details: { reason: '증빙 스크린샷 누락' },
    day: 'd4ago',
    time: '23:18:48',
  },
  {
    id: 'audit-028',
    adminDiscordId: 'demo-eternia',
    action: 'shop.item.remove',
    targetId: 'shop-item-3',
    targetKind: 'shop_item',
    targetDiscordId: null,
    details: { name: 'T6 Cleric Robe' },
    day: 'd4ago',
    time: '21:02:35',
  },
]

// 페이지 렌더 시점에 호출 — `day + time` 을 실제 ISO 로 풀어 항상 "최근" 으로 보이게.
export function getDemoAuditLog(): AdminAuditLogRow[] {
  const now = new Date()
  return ENTRIES.map((e) => {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() + DAY_OFFSET[e.day])
    const [hh, mm, ss] = e.time.split(':').map(Number)
    d.setUTCHours(hh, mm, ss, 0)
    return {
      id: e.id,
      guildId: DEMO_GUILD_ID,
      adminDiscordId: e.adminDiscordId,
      action: e.action,
      targetId: e.targetId,
      targetKind: e.targetKind,
      targetDiscordId: e.targetDiscordId,
      details: e.details,
      createdAt: d.toISOString(),
    }
  })
}

// 어드민 페이지의 `getUsernamesByDiscordIds` 와 동등한 시그니처를 인메모리로 제공.
const USERNAME_TABLE: ReadonlyArray<readonly [string, string]> = [
  ['demo-eternia', 'Eternia'],
  ['demo-daewi', 'Daewi'],
  ['demo-moonrabbit', 'MoonRabbit'],
  ['demo-mochi', 'Mochi'],
  ['demo-shadowace', 'ShadowAce'],
  ['demo-frostpine', 'Frostpine'],
  ['demo-lumina', 'Lumina'],
  ['demo-vexa', 'Vexa'],
  ['demo-borin', 'Borin'],
  ['demo-nebulaq', 'NebulaQ'],
  ['demo-quiet-mage', 'QuietMage'],
]

export function getDemoAuditUsernames(
  discordIds: readonly string[],
): Map<string, string | null> {
  const table = new Map(USERNAME_TABLE)
  const result = new Map<string, string | null>()
  for (const id of discordIds) {
    result.set(id, table.get(id) ?? null)
  }
  return result
}
