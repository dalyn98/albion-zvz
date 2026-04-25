import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  buildLegacyBackfillRows,
  type KillboardPair,
} from '@/lib/battle-tracking-helpers'
import type { AlbionBattle } from '@/lib/albion-battles'

// 마이그 098 이전 legacy row (force_key='__legacy__') 를 새 mainOpponent 모델로
// 일괄 변환하는 일회성 백필. cron 과 동일하게 Bearer CRON_SECRET 으로 인증.
//
// 동작:
//   1. SELECT 대상 rows + raw_battle JOIN. ?limit= 으로 1회 처리량 조절(기본 200).
//      ?mode=legacy (기본): force_key='__legacy__' 만.
//      ?mode=stale&before=<ISO>: 이미 finalized (force_kind in alliance/guild) 이지만
//         match_evaluated_at < before 인 행 — K/D 필터링 로직 변경 후 재처리용.
//   2. 각 row 에 대해 killboard_events (guild_id, battle_id) 페어 조회.
//   3. buildLegacyBackfillRows 로 force 별 row 생성 (페어 없으면 raw_battle 의
//      모든 ≥15 force 를 분리 매치업으로 fallback).
//   4. 같은 (guild_id, battle_record_id) 기존 row 삭제 후 final row insert.
//   5. final row 0 이면 (= 새 컷오프 미통과) 그냥 삭제.
//
// 멱등 — 처리된 행은 match_evaluated_at 가 현재로 갱신되므로 같은 ?before 로
// 다시 호출하면 SELECT 에서 걸러진다.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const mode = url.searchParams.get('mode') === 'stale' ? 'stale' : 'legacy'
  const beforeIso = url.searchParams.get('before')
  if (mode === 'stale' && !beforeIso) {
    return NextResponse.json(
      { error: 'mode=stale requires ?before=<ISO timestamp>' },
      { status: 400 },
    )
  }

  const db = getAdminClient()
  const errors: string[] = []
  let processed = 0
  let inserted = 0
  let deletedNoEngagement = 0

  let sel = db
    .from('tenant_battle_records')
    .select(
      'id, guild_id, battle_record_id, started_at, battle_records!inner(albion_battle_id, raw_battle)',
    )
  if (mode === 'legacy') {
    sel = sel.eq('main_opponent_force_key', '__legacy__')
  } else {
    // stale: 이미 finalized 됐지만 K/D 필터링 로직 변경 전 평가된 행. force_kind
    // 가 alliance/guild 인 행 = 정상 매치업, match_evaluated_at < before 면 재평가
    // 대상.
    sel = sel
      .in('main_opponent_force_kind', ['alliance', 'guild'])
      .lt('match_evaluated_at', beforeIso!)
  }

  const { data: legacyRows, error: selErr } = await sel
    .order('started_at', { ascending: false })
    .limit(limit)

  if (selErr) {
    return NextResponse.json(
      { error: `select: ${selErr.message}` },
      { status: 500 },
    )
  }
  if (!legacyRows || legacyRows.length === 0) {
    return NextResponse.json({
      mode,
      processed: 0,
      inserted: 0,
      deleted_no_engagement: 0,
      remaining_estimate: 0,
      errors,
    })
  }

  const evaluatedAt = new Date().toISOString()

  for (const row of legacyRows) {
    const guildId = row.guild_id as string
    const battleRecordId = row.battle_record_id as string
    const startedAt = row.started_at as string
    const brJoin = row.battle_records as
      | { albion_battle_id: number; raw_battle: AlbionBattle }
      | { albion_battle_id: number; raw_battle: AlbionBattle }[]
      | null
    const br = Array.isArray(brJoin) ? brJoin[0] : brJoin
    if (!br) {
      errors.push(`row ${row.id}: missing battle_records join`)
      continue
    }
    const battle = br.raw_battle
    if (!battle) {
      errors.push(`row ${row.id}: raw_battle missing`)
      continue
    }
    const albionBattleId = br.albion_battle_id

    // home_guild_id 는 raw_battle 에서 직접 추출 못 함 — tenant_battle_records 의
    // home_guild_id 컬럼에서 가져와야 함. SELECT 에 home_guild_id 가 빠졌으니 별도 조회.
    const { data: meta, error: metaErr } = await db
      .from('tenant_battle_records')
      .select('home_guild_id')
      .eq('id', row.id as string)
      .maybeSingle()
    if (metaErr || !meta) {
      errors.push(`row ${row.id}: meta select: ${metaErr?.message ?? 'not found'}`)
      continue
    }
    const homeGuildId = meta.home_guild_id as string

    const { data: pairRows, error: pairErr } = await db
      .from('killboard_events')
      .select('role, opponent_guild, fame')
      .eq('guild_id', guildId)
      .eq('battle_id', albionBattleId)
    if (pairErr) {
      errors.push(`pairs (battle ${albionBattleId}): ${pairErr.message}`)
      continue
    }
    const pairs: KillboardPair[] = (pairRows ?? []).map((r) => ({
      role: r.role as 'killer' | 'victim',
      opponentGuild: (r.opponent_guild as string | null) ?? null,
      fame: (r.fame as number | null) ?? 0,
    }))

    const finalRows = buildLegacyBackfillRows({
      guildId,
      battleRecordId,
      battle,
      homeGuildId,
      startedAt,
      killboardPairs: pairs,
      evaluatedAt,
    })

    const { error: delErr } = await db
      .from('tenant_battle_records')
      .delete()
      .eq('guild_id', guildId)
      .eq('battle_record_id', battleRecordId)
    if (delErr) {
      errors.push(`delete legacy (battle ${albionBattleId}): ${delErr.message}`)
      continue
    }
    processed++

    if (finalRows.length === 0) {
      deletedNoEngagement++
      continue
    }

    const { error: insErr } = await db
      .from('tenant_battle_records')
      .insert(finalRows)
    if (insErr) {
      errors.push(`insert final (battle ${albionBattleId}): ${insErr.message}`)
      continue
    }
    inserted += finalRows.length
  }

  // 다음 호출 분의 추정 잔여량 (정확치 X — count(*) 별도 호출 필요한데 비용 절약).
  let remainingQuery = db
    .from('tenant_battle_records')
    .select('id', { count: 'exact', head: true })
  if (mode === 'legacy') {
    remainingQuery = remainingQuery.eq('main_opponent_force_key', '__legacy__')
  } else {
    remainingQuery = remainingQuery
      .in('main_opponent_force_kind', ['alliance', 'guild'])
      .lt('match_evaluated_at', beforeIso!)
  }
  const { count: remainingCount } = await remainingQuery

  return NextResponse.json({
    mode,
    processed,
    inserted,
    deleted_no_engagement: deletedNoEngagement,
    remaining_estimate: remainingCount ?? null,
    errors,
  })
}
