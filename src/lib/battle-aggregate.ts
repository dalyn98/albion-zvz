// 킬로그 스냅샷 → 최종 배틀 결과 집계.
//
// 입력: `battle_kill_snapshots` 의 raw 킬 이벤트. 호출자는 이미 "윈도우가
// 종료된 pending 배틀" 만 뽑아 전달한다고 가정.
//
// 판정 규칙 (관리자 설정 기반):
//   1. total_players < min_total_players  →  excluded (소규모 교전)
//   2. 길드별 player_count < min_guild_players  →  outcome_role = 'ineligible'
//      (길드 1~2명 스쳐간 케이스 판정 대상에서 제외)
//   3. 나머지 eligible 길드 중 fame_delta 기준 winner/loser/draw 배정.
//      단일 eligible = 'winner' (완전 steamroll 로 간주).
//   4. 우리 길드가 ineligible 이거나 미참여면 battle.outcome = 'excluded'
//      (불공정 판정 회피). 그 외 우리 길드 outcome_role → battle.outcome.
//
// SaaS 확장 포인트: `ownGuildName` 인자만 tenant 별로 바꿔 재집계하면 동일
// 스냅샷에서 각 길드의 관점으로 win/loss 를 계산할 수 있다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppSetting } from './app-settings'
import type { BattleOutcome, BattleParticipantOutcomeRole } from '@/types'

const DEFAULT_GUILD_NAME = process.env.ALBION_GUILD_NAME ?? 'Menhera'

export interface AggregateConfig {
  minTotalPlayers: number
  minGuildPlayers: number
  ownGuildName: string
}

export async function loadAggregateConfig(): Promise<AggregateConfig> {
  const [minTotalRaw, minGuildRaw] = await Promise.all([
    getAppSetting('battle_min_total_players', '30'),
    getAppSetting('battle_min_guild_players', '5'),
  ])
  return {
    minTotalPlayers: Number(minTotalRaw) || 30,
    minGuildPlayers: Number(minGuildRaw) || 5,
    ownGuildName: DEFAULT_GUILD_NAME,
  }
}

interface BattleRow {
  id: string
  event_id: string
  window_start: string
  window_end: string
}

interface SnapshotRow {
  killer_name: string | null
  killer_guild: string | null
  victim_name: string | null
  victim_guild: string | null
  fame: number
}

interface GuildAgg {
  guild_name: string
  players: Set<string>
  kills: number
  deaths: number
  fame_gained: number
  fame_lost: number
}

function ensureGuild(acc: Map<string, GuildAgg>, name: string): GuildAgg {
  const existing = acc.get(name)
  if (existing) return existing
  const fresh: GuildAgg = {
    guild_name: name,
    players: new Set<string>(),
    kills: 0,
    deaths: 0,
    fame_gained: 0,
    fame_lost: 0,
  }
  acc.set(name, fresh)
  return fresh
}

function aggregateSnapshots(rows: SnapshotRow[]): {
  guilds: GuildAgg[]
  totalPlayers: number
} {
  const byGuild = new Map<string, GuildAgg>()
  const allPlayers = new Set<string>()
  for (const r of rows) {
    const fame = Number.isFinite(r.fame) ? r.fame : 0
    if (r.killer_guild && r.killer_name) {
      const g = ensureGuild(byGuild, r.killer_guild)
      g.players.add(r.killer_name)
      g.kills += 1
      g.fame_gained += fame
      allPlayers.add(r.killer_name)
    }
    if (r.victim_guild && r.victim_name) {
      const g = ensureGuild(byGuild, r.victim_guild)
      g.players.add(r.victim_name)
      g.deaths += 1
      g.fame_lost += fame
      allPlayers.add(r.victim_name)
    }
  }
  return { guilds: Array.from(byGuild.values()), totalPlayers: allPlayers.size }
}

interface JudgedGuild {
  guild_name: string
  player_count: number
  kills: number
  deaths: number
  fame_gained: number
  fame_lost: number
  fame_delta: number
  outcome_role: BattleParticipantOutcomeRole | null
  is_own_guild: boolean
}

function judgeGuilds(
  guilds: GuildAgg[],
  config: AggregateConfig,
): JudgedGuild[] {
  const scored = guilds.map((g) => ({
    guild_name: g.guild_name,
    player_count: g.players.size,
    kills: g.kills,
    deaths: g.deaths,
    fame_gained: g.fame_gained,
    fame_lost: g.fame_lost,
    fame_delta: g.fame_gained - g.fame_lost,
    is_own_guild: g.guild_name === config.ownGuildName,
    outcome_role: null as BattleParticipantOutcomeRole | null,
  }))

  const eligible = scored.filter((s) => s.player_count >= config.minGuildPlayers)
  const ineligibleNames = new Set(
    scored.filter((s) => s.player_count < config.minGuildPlayers).map((s) => s.guild_name),
  )

  for (const s of scored) {
    if (ineligibleNames.has(s.guild_name)) {
      s.outcome_role = 'ineligible'
    }
  }

  if (eligible.length === 0) return scored

  if (eligible.length === 1) {
    const only = scored.find((s) => s.guild_name === eligible[0].guild_name)
    if (only) only.outcome_role = 'winner'
    return scored
  }

  const maxDelta = Math.max(...eligible.map((e) => e.fame_delta))
  const minDelta = Math.min(...eligible.map((e) => e.fame_delta))

  for (const s of scored) {
    if (s.outcome_role === 'ineligible') continue
    if (maxDelta === minDelta) {
      s.outcome_role = 'draw'
    } else if (s.fame_delta === maxDelta) {
      s.outcome_role = 'winner'
    } else if (s.fame_delta === minDelta) {
      s.outcome_role = 'loser'
    } else {
      s.outcome_role = 'draw'
    }
  }
  return scored
}

function resolveBattleOutcome(
  judged: JudgedGuild[],
  totalPlayers: number,
  config: AggregateConfig,
): { outcome: BattleOutcome; exclude_reason: string | null } {
  if (totalPlayers < config.minTotalPlayers) {
    return { outcome: 'excluded', exclude_reason: 'too_small' }
  }
  const own = judged.find((g) => g.is_own_guild)
  if (!own) return { outcome: 'excluded', exclude_reason: 'own_guild_absent' }
  if (own.outcome_role === 'ineligible' || own.outcome_role === null) {
    return { outcome: 'excluded', exclude_reason: 'own_guild_ineligible' }
  }
  if (own.outcome_role === 'winner') return { outcome: 'win', exclude_reason: null }
  if (own.outcome_role === 'loser') return { outcome: 'loss', exclude_reason: null }
  return { outcome: 'draw', exclude_reason: null }
}

export interface AggregateBattleResult {
  battle_id: string
  event_id: string
  outcome: BattleOutcome
  exclude_reason: string | null
  total_players: number
  guild_count: number
}

export async function aggregateBattle(
  db: SupabaseClient,
  battle: BattleRow,
  config: AggregateConfig,
): Promise<AggregateBattleResult> {
  const { data: snapshots, error: snapErr } = await db
    .from('battle_kill_snapshots')
    .select('killer_name, killer_guild, victim_name, victim_guild, fame')
    .eq('battle_id', battle.id)
  if (snapErr) throw new Error(`snapshots query failed: ${snapErr.message}`)

  const { guilds, totalPlayers } = aggregateSnapshots(
    (snapshots ?? []) as SnapshotRow[],
  )
  const judged = judgeGuilds(guilds, config)
  const { outcome, exclude_reason } = resolveBattleOutcome(judged, totalPlayers, config)

  // 기존 참여 길드 행 삭제 후 재삽입 — 재집계도 이 경로를 그대로 탄다.
  const { error: delErr } = await db
    .from('battle_participants')
    .delete()
    .eq('battle_id', battle.id)
  if (delErr) throw new Error(`participants clear failed: ${delErr.message}`)

  if (judged.length > 0) {
    const { error: insErr } = await db.from('battle_participants').insert(
      judged.map((g) => ({
        battle_id: battle.id,
        guild_name: g.guild_name,
        player_count: g.player_count,
        kills: g.kills,
        deaths: g.deaths,
        fame_gained: g.fame_gained,
        fame_lost: g.fame_lost,
        is_own_guild: g.is_own_guild,
        outcome_role: g.outcome_role,
      })),
    )
    if (insErr) throw new Error(`participants insert failed: ${insErr.message}`)
  }

  const nowIso = new Date().toISOString()
  const { error: updErr } = await db
    .from('battles')
    .update({
      outcome,
      exclude_reason,
      total_players: totalPlayers,
      aggregated_at: nowIso,
    })
    .eq('id', battle.id)
  if (updErr) throw new Error(`battle update failed: ${updErr.message}`)

  return {
    battle_id: battle.id,
    event_id: battle.event_id,
    outcome,
    exclude_reason,
    total_players: totalPlayers,
    guild_count: judged.length,
  }
}

export interface AggregateRunResult {
  scanned: number
  aggregated: AggregateBattleResult[]
  errors: Array<{ battle_id: string; message: string }>
}

// 윈도우가 종료된 pending 배틀을 찾아 일괄 집계. cron 이 반복 호출해도 pending
// 만 처리하므로 idempotent — 재집계가 필요하면 outcome 을 pending 으로 되돌려
// 두면 된다 (현재 UI 엔 노출 안 하지만 수동으로 가능).
export async function aggregatePendingBattles(
  db: SupabaseClient,
): Promise<AggregateRunResult> {
  const config = await loadAggregateConfig()
  const nowIso = new Date().toISOString()
  const { data: pending, error } = await db
    .from('battles')
    .select('id, event_id, window_start, window_end')
    .eq('outcome', 'pending')
    .lte('window_end', nowIso)
    .order('window_end', { ascending: true })
    .limit(20)
  if (error) throw new Error(`pending battles query failed: ${error.message}`)

  const results: AggregateBattleResult[] = []
  const errors: Array<{ battle_id: string; message: string }> = []
  for (const row of pending ?? []) {
    const battle: BattleRow = {
      id: row.id as string,
      event_id: row.event_id as string,
      window_start: row.window_start as string,
      window_end: row.window_end as string,
    }
    try {
      results.push(await aggregateBattle(db, battle, config))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ battle_id: battle.id, message })
      await db
        .from('battles')
        .update({ outcome: 'error', exclude_reason: message.slice(0, 200) })
        .eq('id', battle.id)
    }
  }
  return { scanned: pending?.length ?? 0, aggregated: results, errors }
}
