import { NextResponse } from 'next/server'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { fetchTrackedBattleWindows } from '@/lib/tracked-kills'
import { getSuperAdminSession } from '@/lib/super-admin'
import { withNoStore } from '@/lib/no-store-response'
import {
  BATTLELOG_PAUSED_API_STATUS,
  areBattlelogFeaturesPaused,
  getBattlelogPausePayload,
} from '@/lib/battlelog-pause'

// 임시 진단 엔드포인트. tenant_battle_records 시간창이 events.battle_started_at /
// killboard_events.occurred_at 와 어떻게 맞물리는지 눈으로 확인하기 위함.
// 승/패 통계가 0 으로 나오는 원인을 찾기 위해 투입.

export const dynamic = 'force-dynamic'

function json(body: unknown, init?: ResponseInit) {
  return withNoStore(NextResponse.json(body, init))
}

export async function GET() {
  const session = await getSuperAdminSession()
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (areBattlelogFeaturesPaused()) {
    return json(
      getBattlelogPausePayload('stats-diagnose'),
      { status: BATTLELOG_PAUSED_API_STATUS },
    )
  }

  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const [trackedBattles, eventsRes, killsRes] = await Promise.all([
    fetchTrackedBattleWindows(db, guildId),
    db
      .from('events')
      .select('id, title, gather_at, battle_started_at, guild_id')
      .eq('guild_id', guildId)
      .not('battle_started_at', 'is', null)
      .order('battle_started_at', { ascending: false })
      .limit(30),
    db
      .from('killboard_events')
      .select('event_id, discord_id, role, occurred_at, battle_id')
      .eq('guild_id', guildId)
      .order('occurred_at', { ascending: false })
      .limit(30),
  ])

  const { windows, byBattleId } = trackedBattles
  const windowList = windows.map((w) => ({
    started_at: new Date(w.startedAtMs + 15 * 60 * 1000).toISOString(),
    ended_at: new Date(w.endedAtMs - 15 * 60 * 1000).toISOString(),
    window_start_padded: new Date(w.startedAtMs).toISOString(),
    window_end_padded: new Date(w.endedAtMs).toISOString(),
    outcome: w.outcome,
    albion_battle_id: w.albionBattleId,
  }))

  const eventMatches = (eventsRes.data ?? []).map((e) => {
    const t = e.battle_started_at ? Date.parse(e.battle_started_at) : NaN
    let matchedOutcome: string | null = null
    let nearestDeltaMin: number | null = null
    let nearestWindow: {
      started_at: string
      ended_at: string
      outcome: string
    } | null = null
    for (const w of windows) {
      const centerMs = (w.startedAtMs + w.endedAtMs) / 2
      const deltaMin = Math.abs(t - centerMs) / 60000
      if (
        nearestDeltaMin == null ||
        deltaMin < nearestDeltaMin
      ) {
        nearestDeltaMin = deltaMin
        nearestWindow = {
          started_at: new Date(w.startedAtMs + 15 * 60 * 1000).toISOString(),
          ended_at: new Date(w.endedAtMs - 15 * 60 * 1000).toISOString(),
          outcome: w.outcome,
        }
      }
      if (t >= w.startedAtMs && t <= w.endedAtMs) {
        matchedOutcome = w.outcome
      }
    }
    return {
      event_id: e.id,
      title: e.title,
      gather_at: e.gather_at,
      battle_started_at: e.battle_started_at,
      matched_outcome: matchedOutcome,
      nearest_window: nearestWindow,
      nearest_delta_min:
        nearestDeltaMin != null ? Math.round(nearestDeltaMin) : null,
    }
  })

  const killMatches = (killsRes.data ?? []).map((k) => {
    const battleId = (k.battle_id as number | null) ?? null
    const t = Date.parse(k.occurred_at as string)
    let matched = false
    let matchedBy: 'battle_id' | 'time' | null = null
    if (battleId !== null && byBattleId.has(battleId)) {
      matched = true
      matchedBy = 'battle_id'
    } else if (battleId === null) {
      // legacy 행만 시간창 폴백 — 새 데이터 매칭 정확도와 비교용.
      matched = windows.some((w) => t >= w.startedAtMs && t <= w.endedAtMs)
      if (matched) matchedBy = 'time'
    }
    return {
      event_id: k.event_id,
      discord_id: k.discord_id,
      role: k.role,
      occurred_at: k.occurred_at,
      battle_id: battleId,
      within_tracked_window: matched,
      matched_by: matchedBy,
    }
  })

  const eventsMatched = eventMatches.filter((e) => e.matched_outcome != null).length
  const killsMatched = killMatches.filter((k) => k.within_tracked_window).length

  return json({
    guild_id: guildId,
    summary: {
      tracked_windows_count: windows.length,
      tracked_battle_id_count: byBattleId.size,
      recent_events_count: eventMatches.length,
      events_matched_to_window: eventsMatched,
      recent_kills_count: killMatches.length,
      kills_within_window: killsMatched,
    },
    tracked_windows: windowList,
    recent_events: eventMatches,
    recent_kills: killMatches,
  })
}
