'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import type { SizeCategory } from '@/lib/albion-battles'

// 단일 tenant_battle_records 의 상세. 전투 헤더 정보 + 해당 전투 시간창 안에서
// 길드원이 낸 킬/데스 이벤트 목록. 길드원 판정은 guild_avatars 조인 — 탈퇴자
// 포함 (withdrawn_at 무시) 해야 과거 전투에서 탈퇴한 멤버의 킬도 보인다.

export interface BattleKillEvent {
  event_id: string
  discord_id: string
  username: string
  avatar: string | null
  role: 'killer' | 'victim'
  opponent_name: string | null
  opponent_guild: string | null
  fame: number
  item_power: number | null
  occurred_at: string
}

export interface BattleDetail {
  id: string
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  endedAt: string
  homeGuildName: string
  homeAllianceName: string | null
  homeTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  opponentGuildNames: string[]
  opponentAllianceNames: string[]
  primaryOpponentName: string | null
  sizeCategory: SizeCategory
  outcome: 'win' | 'loss' | 'tie'
  // 전투 시간창 안에서 길드원이 낸 killboard 이벤트. occurred_at 오름차순.
  events: BattleKillEvent[]
}

// 매칭 창 padding — tracked-kills 와 동일한 15분. 전투 시작/끝 경계에서 놓치는
// 이벤트를 최소화. 과하게 잡혀도 동일 배틀 시간대라 UI 상 혼동은 없다.
const WINDOW_PADDING_MS = 15 * 60 * 1000

export async function getBattleDetail(id: string): Promise<{
  detail: BattleDetail | null
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { detail: null, error: 'Unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const { data: tenantRow, error: tenantErr } = await db
      .from('tenant_battle_records')
      .select(
        'id, battle_record_id, home_guild_name, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name, ended_at)',
      )
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (tenantErr) return { detail: null, error: tenantErr.message }
    if (!tenantRow) return { detail: null }

    const battle = Array.isArray(tenantRow.battle_records)
      ? tenantRow.battle_records[0]
      : tenantRow.battle_records
    const endedAt = (battle?.ended_at as string | null) ?? (tenantRow.started_at as string)

    const startMs = Date.parse(tenantRow.started_at as string)
    const endMs = Date.parse(endedAt)
    const windowStart = new Date(startMs - WINDOW_PADDING_MS).toISOString()
    const windowEnd = new Date(endMs + WINDOW_PADDING_MS).toISOString()

    // 전투 시간창 안의 길드원 killboard_events. guild_avatars 조인으로 이름/아바타
    // 동시에 가져온다. 탈퇴자도 포함되도록 filter 없이 join.
    const { data: events, error: eventsErr } = await db
      .from('killboard_events')
      .select(
        'event_id, role, fame, item_power, occurred_at, opponent_name, opponent_guild, discord_id, guild_avatars!inner(username, avatar)',
      )
      .eq('guild_id', guildId)
      .gte('occurred_at', windowStart)
      .lte('occurred_at', windowEnd)
      .order('occurred_at', { ascending: true })
    if (eventsErr) return { detail: null, error: eventsErr.message }

    type EventRow = {
      event_id: number | string | null
      role: string | null
      fame: number | null
      item_power: number | null
      occurred_at: string | null
      opponent_name: string | null
      opponent_guild: string | null
      discord_id: string | null
      guild_avatars:
        | { username: string | null; avatar: string | null }
        | { username: string | null; avatar: string | null }[]
        | null
    }

    const battleEvents: BattleKillEvent[] = []
    for (const row of (events ?? []) as EventRow[]) {
      if (!row.discord_id || !row.occurred_at) continue
      if (row.role !== 'killer' && row.role !== 'victim') continue
      const avatar = Array.isArray(row.guild_avatars)
        ? row.guild_avatars[0]
        : row.guild_avatars
      if (!avatar?.username) continue
      battleEvents.push({
        event_id: String(row.event_id ?? ''),
        discord_id: row.discord_id,
        username: avatar.username,
        avatar: avatar.avatar,
        role: row.role,
        opponent_name: row.opponent_name,
        opponent_guild: row.opponent_guild,
        fame: row.fame ?? 0,
        item_power: row.item_power,
        occurred_at: row.occurred_at,
      })
    }

    const detail: BattleDetail = {
      id: tenantRow.id as string,
      albionBattleId: battle?.albion_battle_id as number,
      clusterName: (battle?.cluster_name as string | null) ?? null,
      startedAt: tenantRow.started_at as string,
      endedAt,
      homeGuildName: tenantRow.home_guild_name as string,
      homeAllianceName: (tenantRow.home_alliance_name as string | null) ?? null,
      homeTeamSize: tenantRow.home_team_size as number,
      homeKills: tenantRow.home_kills as number,
      homeDeaths: tenantRow.home_deaths as number,
      homeKillFame: tenantRow.home_kill_fame as number,
      opponentTeamSize: tenantRow.opponent_team_size as number,
      opponentKills: tenantRow.opponent_kills as number,
      opponentDeaths: tenantRow.opponent_deaths as number,
      opponentKillFame: tenantRow.opponent_kill_fame as number,
      opponentGuildNames: (tenantRow.opponent_guild_names as string[] | null) ?? [],
      opponentAllianceNames: (tenantRow.opponent_alliance_names as string[] | null) ?? [],
      primaryOpponentName: (tenantRow.primary_opponent_name as string | null) ?? null,
      sizeCategory: tenantRow.size_category as SizeCategory,
      outcome: tenantRow.outcome as 'win' | 'loss' | 'tie',
      events: battleEvents,
    }
    return { detail }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : 'serverError' }
  }
}
