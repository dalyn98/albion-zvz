'use server'

import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import type { AlbionBattle } from '@/lib/albion-battles'
import {
  buildTenantBattleRow,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'

// battle_records 에서 "이 홈 길드가 involved_guild_ids 에 들어있는" 모든 전투를
// 끌어와 tenant 시점으로 계산해 tenant_battle_records 에 upsert. 새 tenant 가
// 홈 길드를 설정한 직후 호출 — cron 이 이미 저장해둔 raw_battle 을 해당 tenant
// 관점으로 재해석한다. 규모 카테고리는 buildTenantBattleRow 가 자동 분류.
// 홈 길드 UUID/서버 미설정이면 조용히 스킵 (온보딩 중간 상태일 수 있음).
export async function backfillTenantBattleRecords(guildId: string): Promise<void> {
  const db = getAdminClient()

  const [homeGuildId, serverRaw] = await Promise.all([
    getAppSetting('albion_home_guild_id', '', guildId),
    getAppSetting('albion_server', 'east', guildId),
  ])
  if (!homeGuildId) return
  if (!isAlbionServer(serverRaw)) return
  const server: AlbionServer = serverRaw

  // involved_guild_ids 배열 contains 연산: GIN 인덱스가 걸려있어 빠르다.
  const { data: records, error } = await db
    .from('battle_records')
    .select('id, albion_server, started_at, raw_battle')
    .eq('albion_server', server)
    .contains('involved_guild_ids', [homeGuildId])
  if (error) throw new Error(error.message)
  if (!records || records.length === 0) return

  const rows: TenantBattleRow[] = []
  for (const rec of records) {
    const battle = rec.raw_battle as AlbionBattle | null
    if (!battle) continue
    const row = buildTenantBattleRow({
      guildId,
      battleRecordId: rec.id as string,
      battle,
      homeGuildId,
      startedAt: rec.started_at as string,
    })
    if (row) rows.push(row)
  }

  if (rows.length === 0) return

  // 큰 tenant 의 backfill 은 수천 건이 될 수 있어 chunked upsert. Supabase
  // 기본 페이로드 제한(약 1MB) 안에서 안전하게 돌아가는 크기.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error: upErr } = await db
      .from('tenant_battle_records')
      .upsert(chunk, { onConflict: 'guild_id,battle_record_id' })
    if (upErr) throw new Error(upErr.message)
  }
}
