'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import {
  isSizeCategory,
  SIZE_CATEGORIES,
  type AlbionBattle,
  type SizeCategory,
} from '@/lib/albion-battles'
import {
  buildTenantBattleRow,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'

export interface BattleTrackingConfig {
  enabled: boolean
  sizes: SizeCategory[]
}

// 한 tenant 의 battle tracking 설정(enabled + sizes) 을 한 번에 읽는다. 설정 페이지
// 와 cron 양쪽에서 쓰이며, 키 두 개를 각각 fetch 하면 N+1 가 되므로 병렬.
export async function getBattleTrackingConfig(
  guildId: string,
): Promise<BattleTrackingConfig> {
  const [enabledRaw, sizesRaw] = await Promise.all([
    getAppSetting('battle_tracking_enabled', 'false', guildId),
    getAppSetting('battle_tracking_sizes', '[]', guildId),
  ])
  const enabled = enabledRaw === 'true'
  const sizes = parseSizes(sizesRaw)
  return { enabled, sizes }
}

function parseSizes(raw: string): SizeCategory[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSizeCategory)
  } catch {
    return []
  }
}

// 관리자가 설정 페이지에서 토글/체크박스로 전투기록 수집 구성을 저장. enabled 가
// true 로 새로 바뀌면 이미 battle_records 에 쌓여있던 과거 전투들을 tenant 시점
// 으로 소급 반영(backfill) 한다. 거기까지 한 액션에 묶어놓아야 관리자가 "켰는데
// 목록이 왜 비어?" 로 혼란하지 않는다.
export async function saveBattleTrackingConfig(input: {
  enabled: boolean
  sizes: SizeCategory[]
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (typeof input.enabled !== 'boolean') {
      return { error: tErr('invalidBoolean') }
    }
    if (!Array.isArray(input.sizes) || !input.sizes.every(isSizeCategory)) {
      return { error: tErr('invalidEnumValue', { values: SIZE_CATEGORIES.join(', ') }) }
    }
    // 중복 제거 — UI 에서 체크박스 중복 전송을 받아도 DB 에는 깔끔히 들어가게.
    const dedupedSizes = Array.from(new Set(input.sizes))

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const now = new Date().toISOString()

    const { error } = await db.from('app_settings').upsert(
      [
        {
          guild_id: guildId,
          key: 'battle_tracking_enabled',
          value: input.enabled ? 'true' : 'false',
          updated_at: now,
        },
        {
          guild_id: guildId,
          key: 'battle_tracking_sizes',
          value: JSON.stringify(dedupedSizes),
          updated_at: now,
        },
      ],
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: error.message }

    // 새로 켜졌거나 size 목록이 확장된 경우에만 의미가 있지만, "무언가 바뀐" 호출
    // 전체에서 한 번 돌려도 upsert 는 idempotent 이므로 항상 시도한다. 비용은
    // battle_records 조회 1회 + 매칭 건수만큼 upsert (보통 수백 건 이하).
    if (input.enabled && dedupedSizes.length > 0) {
      await backfillTenantBattleRecords(guildId)
    }

    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/battles')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// battle_records 에서 "이 홈 길드가 involved_guild_ids 에 들어있는" 모든 전투를
// 끌어와 tenant 시점으로 계산해 tenant_battle_records 에 upsert. 주로 두 시점에
// 불린다:
//   1. 관리자가 battle tracking 을 처음 켤 때 — 과거 전투 소급 반영
//   2. 새 tenant 가 가입했을 때 — cron 이 이미 저장해둔 raw_battle 을 해당 tenant
//      관점으로 재해석
// 크기 필터는 설정에 따른 SIZE_CATEGORIES 만 통과. 홈 길드 UUID/서버 미설정이면
// 조용히 스킵 (에러 아님 — 온보딩 중간 상태일 수 있음).
export async function backfillTenantBattleRecords(guildId: string): Promise<void> {
  const db = getAdminClient()

  const [config, homeGuildId, serverRaw] = await Promise.all([
    getBattleTrackingConfig(guildId),
    getAppSetting('albion_home_guild_id', '', guildId),
    getAppSetting('albion_server', 'east', guildId),
  ])
  if (!config.enabled || config.sizes.length === 0) return
  if (!homeGuildId) return
  if (!isAlbionServer(serverRaw)) return
  const server: AlbionServer = serverRaw
  const enabledSizes = new Set<SizeCategory>(config.sizes)

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
      enabledSizes,
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
