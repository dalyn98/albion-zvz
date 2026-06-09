// 시스템 공지 (모든 테넌트에 노출되는 글로벌 배너) 데이터 헬퍼.
//
// 활성 조건: archived_at is null 그리고 (expires_at is null OR expires_at > now()).
// 가벼운 쿼리지만 모든 페이지 SSR 마다 호출되므로 head:true 인덱스 (super_admin_
// notices_active_idx) 가 받쳐준다.

import { getAdminClient } from '@/lib/supabase-admin'
import { unstable_cache } from 'next/cache'

export const SYSTEM_NOTICES_TAG = 'system-notices:active'

export interface SystemNotice {
  id: string
  message: string
  imageUrl: string | null
  expiresAt: string | null
  createdAt: string
  createdByDiscordId: string
  archivedAt: string | null
}

function rowToNotice(r: Record<string, unknown>): SystemNotice {
  return {
    id: r.id as string,
    message: r.message as string,
    imageUrl: (r.image_url as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
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
    .select('id, message, image_url, expires_at, created_at, created_by_discord_id, archived_at')
    .is('archived_at', null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
  return (data ?? []).map(rowToNotice)
}

export const listActiveSystemNotices = unstable_cache(
  listActiveSystemNoticesUncached,
  ['system-notices:active:v1'],
  { tags: [SYSTEM_NOTICES_TAG], revalidate: 60 },
)

export async function listAllSystemNotices(): Promise<SystemNotice[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('super_admin_notices')
    .select('id, message, image_url, expires_at, created_at, created_by_discord_id, archived_at')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map(rowToNotice)
}
