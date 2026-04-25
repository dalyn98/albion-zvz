// Albion 길드 로스터 sync 로직.
//
// 목적: tenant 의 홈 길드 ID 로 /guilds/{id}/members 를 호출해 albion_guild_
// members 테이블을 최신 상태로 유지. Discord 미연동 멤버까지 포함된 전체
// 로스터를 가져와 ZvZ 통계를 "전 멤버 기준" 으로 낼 수 있게 한다.
//
// 동작:
//   1. tenant 의 albion_server / albion_home_guild_id 읽기
//   2. fetchGuildMembers 로 현재 로스터 받기
//   3. upsert: 응답에 있는 모든 멤버를 last_seen_at = now, left_at = null 로 갱신
//   4. soft-delete: 기존 행 중 응답에 없는 살아있는 멤버는 left_at = now 로 표시
//   5. 재가입 (left_at 있던 행이 응답에 다시 등장) 은 (3) 에서 자동으로 left_at = null 로 복구

import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  fetchGuildMembers,
  isAlbionServer,
  type GameinfoGuildMember,
} from '@/lib/albion-gameinfo'

export interface AlbionRosterSyncResult {
  fetched: number
  upserted: number
  marked_left: number
  rejoined: number
}

export type AlbionRosterSyncOutcome =
  | { kind: 'ok'; result: AlbionRosterSyncResult }
  | { kind: 'skipped'; reason: string }
  | { kind: 'error'; message: string }

export async function runAlbionRosterSync(
  tenantId: string,
): Promise<AlbionRosterSyncOutcome> {
  const [serverRaw, homeGuildId] = await Promise.all([
    getAppSetting('albion_server', 'east', tenantId),
    getAppSetting('albion_home_guild_id', '', tenantId),
  ])

  if (!homeGuildId) return { kind: 'skipped', reason: 'no_home_guild' }
  if (!isAlbionServer(serverRaw)) return { kind: 'skipped', reason: 'invalid_server' }

  const members = await fetchGuildMembers(serverRaw, homeGuildId)
  if (members === null) return { kind: 'error', message: 'fetchGuildMembers failed' }

  const db = getAdminClient()
  const now = new Date().toISOString()

  // 응답에 등장한 player_id 집합 — 이후 left_at 처리에 사용.
  const seenIds = new Set(members.map((m) => m.Id))

  // 재가입 판별을 위해 기존 left_at 상태 미리 조회.
  const { data: existing, error: existingErr } = await db
    .from('albion_guild_members')
    .select('albion_player_id, left_at')
    .eq('guild_id', tenantId)
    .eq('albion_server', serverRaw)
  if (existingErr) return { kind: 'error', message: `read existing: ${existingErr.message}` }

  const existingMap = new Map<string, { leftAt: string | null }>()
  for (const r of existing ?? []) {
    existingMap.set(r.albion_player_id as string, { leftAt: (r.left_at as string | null) ?? null })
  }

  let rejoined = 0
  const rows = members.map((m) => {
    const prev = existingMap.get(m.Id)
    if (prev?.leftAt) rejoined += 1
    return buildRow(tenantId, serverRaw, m, now)
  })

  if (rows.length > 0) {
    const { error: upErr } = await db
      .from('albion_guild_members')
      .upsert(rows, { onConflict: 'guild_id,albion_server,albion_player_id' })
    if (upErr) return { kind: 'error', message: `upsert: ${upErr.message}` }
  }

  // soft-delete: 응답에 없는 살아있는 행을 left_at 로 마킹.
  const missingIds = (existing ?? [])
    .filter((r) => r.left_at === null && !seenIds.has(r.albion_player_id as string))
    .map((r) => r.albion_player_id as string)

  let markedLeft = 0
  if (missingIds.length > 0) {
    const { error: leftErr, count } = await db
      .from('albion_guild_members')
      .update({ left_at: now, updated_at: now }, { count: 'exact' })
      .eq('guild_id', tenantId)
      .eq('albion_server', serverRaw)
      .in('albion_player_id', missingIds)
    if (leftErr) return { kind: 'error', message: `mark_left: ${leftErr.message}` }
    markedLeft = count ?? missingIds.length
  }

  return {
    kind: 'ok',
    result: {
      fetched: members.length,
      upserted: rows.length,
      marked_left: markedLeft,
      rejoined,
    },
  }
}

function buildRow(
  tenantId: string,
  server: 'west' | 'east' | 'europe',
  m: GameinfoGuildMember,
  nowIso: string,
) {
  return {
    guild_id: tenantId,
    albion_server: server,
    albion_player_id: m.Id,
    albion_player_name: m.Name,
    albion_guild_id: m.GuildId,
    albion_guild_name: m.GuildName,
    albion_alliance_id: m.AllianceId || null,
    albion_alliance_name: m.AllianceName || null,
    kill_fame: m.KillFame ?? 0,
    death_fame: m.DeathFame ?? 0,
    fame_ratio: m.FameRatio ?? 0,
    average_item_power: m.AverageItemPower ?? 0,
    avatar: m.Avatar || null,
    avatar_ring: m.AvatarRing || null,
    last_seen_at: nowIso,
    left_at: null,
    updated_at: nowIso,
  }
}
