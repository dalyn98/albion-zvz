// 시스템 공지 (모든 테넌트에 노출되는 글로벌 배너) 데이터 헬퍼.
//
// 활성 조건: archived_at is null 그리고 expires_at > now().
// 가벼운 쿼리지만 모든 페이지 SSR 마다 호출되므로 head:true 인덱스 (super_admin_
// notices_active_idx) 가 받쳐준다.

import { getAdminClient } from '@/lib/supabase-admin'
import { unstable_cache } from 'next/cache'

export const SYSTEM_NOTICES_TAG = 'system-notices:active'

export const SYSTEM_NOTICE_PURPOSES = ['incident', 'maintenance', 'security'] as const
export const SYSTEM_NOTICE_SEVERITIES = ['important', 'critical'] as const

export type SystemNoticePurpose = (typeof SYSTEM_NOTICE_PURPOSES)[number]
export type SystemNoticeSeverity = (typeof SYSTEM_NOTICE_SEVERITIES)[number]

export function isSystemNoticePurpose(value: string): value is SystemNoticePurpose {
  return (SYSTEM_NOTICE_PURPOSES as readonly string[]).includes(value)
}

export function isSystemNoticeSeverity(value: string): value is SystemNoticeSeverity {
  return (SYSTEM_NOTICE_SEVERITIES as readonly string[]).includes(value)
}

export interface SystemNotice {
  id: string
  message: string
  imageUrl: string | null
  expiresAt: string
  purpose: SystemNoticePurpose
  severity: SystemNoticeSeverity
  createdAt: string
  createdByDiscordId: string
  archivedAt: string | null
}

function rowToNotice(r: Record<string, unknown>): SystemNotice {
  return {
    id: r.id as string,
    message: r.message as string,
    imageUrl: (r.image_url as string | null) ?? null,
    expiresAt: r.expires_at as string,
    purpose: r.purpose as SystemNoticePurpose,
    severity: r.severity as SystemNoticeSeverity,
    createdAt: r.created_at as string,
    createdByDiscordId: r.created_by_discord_id as string,
    archivedAt: (r.archived_at as string | null) ?? null,
  }
}

async function listActiveSystemNoticesUncached(): Promise<SystemNotice[]> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const { data } = await db
    .from('super_admin_notices')
    .select('id, message, image_url, expires_at, purpose, severity, created_at, created_by_discord_id, archived_at')
    .is('archived_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
  return (data ?? []).map(rowToNotice)
}

const listActiveSystemNoticesCached = unstable_cache(
  listActiveSystemNoticesUncached,
  ['system-notices:active:v2'],
  { tags: [SYSTEM_NOTICES_TAG], revalidate: 60 },
)

export function retainUnexpiredSingleSystemNotice(
  notices: readonly SystemNotice[],
  nowMs: number = Date.now(),
): SystemNotice[] {
  return notices
    .filter((notice) => Date.parse(notice.expiresAt) > nowMs)
    .slice(0, 1)
}

// A cached row can cross its expiry boundary during the 60-second cache window.
// Re-check time after cache lookup so an expired critical notice never lingers.
export async function listActiveSystemNotices(): Promise<SystemNotice[]> {
  const notices = await listActiveSystemNoticesCached()
  return retainUnexpiredSingleSystemNotice(notices)
}

export async function listAllSystemNotices(): Promise<SystemNotice[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('super_admin_notices')
    .select('id, message, image_url, expires_at, purpose, severity, created_at, created_by_discord_id, archived_at')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map(rowToNotice)
}
