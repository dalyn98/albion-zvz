'use server'

import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'

export interface GuildRecord {
  opponent_guild_id: string | null
  name: string
  wins: number
  losses: number
  total: number
}

export interface OpponentEventRecord {
  event_id: string
  event_title: string
  event_started_at: string | null
  event_finalized_at: string | null
  battles: Array<{
    battle_number: number
    outcome: 'win' | 'loss'
  }>
}

// 길드별 집계. event_battles 의 outcome 이 그대로 승/패 카운트.
// FK 가 걸린 행은 opponent_guild_id 기준, 레거시 행은 lowercase 이름 기준으로
// dedup 해 같은 길드가 두 줄로 갈라지지 않게 한다.
export async function listGuildRecords(): Promise<{
  records: GuildRecord[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { records: [], error: 'Unauthorized' }

    const db = getAdminClient()
    const { data, error } = await db
      .from('event_battles')
      .select('opponent_guild_id, opponent_guild, outcome')
    if (error) return { records: [], error: error.message }

    interface Agg {
      opponent_guild_id: string | null
      name: string
      wins: number
      losses: number
    }
    const map = new Map<string, Agg>()
    for (const row of data ?? []) {
      const key = row.opponent_guild_id
        ? `id:${row.opponent_guild_id}`
        : `name:${(row.opponent_guild ?? '').trim().toLowerCase()}`
      if (!map.has(key)) {
        map.set(key, {
          opponent_guild_id: row.opponent_guild_id ?? null,
          name: row.opponent_guild ?? '',
          wins: 0,
          losses: 0,
        })
      }
      const agg = map.get(key)!
      if (row.outcome === 'win') agg.wins++
      else if (row.outcome === 'loss') agg.losses++
    }

    const records: GuildRecord[] = Array.from(map.values())
      .map((a) => ({ ...a, total: a.wins + a.losses }))
      .filter((r) => r.total > 0)
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        return a.name.localeCompare(b.name)
      })
    return { records }
  } catch (e) {
    return { records: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 특정 길드와 벌인 이벤트별 전투 기록. FK 가 연결된 경우 id 로 매칭,
// 레거시 행은 lowercase 이름 매칭을 fallback 으로 허용.
export async function getBattlesAgainst(opponentGuildId: string): Promise<{
  guild: { id: string; name: string; notes: string | null } | null
  events: OpponentEventRecord[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { guild: null, events: [], error: 'Unauthorized' }

    const db = getAdminClient()

    const { data: guild, error: guildErr } = await db
      .from('opponent_guilds')
      .select('id, name, notes')
      .eq('id', opponentGuildId)
      .maybeSingle()
    if (guildErr) return { guild: null, events: [], error: guildErr.message }
    if (!guild) return { guild: null, events: [], error: tErr('opponentGuildNotFound') }

    // Migration 024 이후로는 모든 행이 FK 로 연결돼 있으므로 id 매칭으로
    // 충분. 레거시 fallback 이 필요해지면 두 번째 쿼리를 이름 기준으로 별도
    // 수행해 머지하면 된다.
    const { data: battles, error: battlesErr } = await db
      .from('event_battles')
      .select(
        'battle_number, outcome, event_id, events!inner(id, title, battle_started_at, finalized_at)',
      )
      .eq('opponent_guild_id', guild.id)
      .order('battle_number', { ascending: true })
    if (battlesErr) return { guild, events: [], error: battlesErr.message }

    const eventsMap = new Map<string, OpponentEventRecord>()
    for (const row of battles ?? []) {
      const eventRaw = row.events as
        | { id: string; title: string; battle_started_at: string | null; finalized_at: string | null }
        | { id: string; title: string; battle_started_at: string | null; finalized_at: string | null }[]
        | null
      const event = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw
      if (!event) continue
      if (!eventsMap.has(event.id)) {
        eventsMap.set(event.id, {
          event_id: event.id,
          event_title: event.title,
          event_started_at: event.battle_started_at,
          event_finalized_at: event.finalized_at,
          battles: [],
        })
      }
      eventsMap.get(event.id)!.battles.push({
        battle_number: row.battle_number,
        outcome: row.outcome as 'win' | 'loss',
      })
    }

    const events = Array.from(eventsMap.values()).sort((a, b) => {
      const ak = a.event_started_at ?? a.event_finalized_at ?? ''
      const bk = b.event_started_at ?? b.event_finalized_at ?? ''
      return bk.localeCompare(ak)
    })

    return { guild, events }
  } catch (e) {
    return { guild: null, events: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
