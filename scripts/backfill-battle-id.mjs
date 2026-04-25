#!/usr/bin/env node
// 일회성 백필. killboard_events.battle_id 가 NULL 인 행을 채운다 (마이그 096
// 이전에 동기화된 행). distinct albion_player_id 별로 /players/{id}/{kills,deaths}
// ?range=month 을 호출해 EventId→BattleId 매핑을 만들고 UPDATE.
// 사용: node --env-file=.env.local scripts/backfill-battle-id.mjs

import { createClient } from '@supabase/supabase-js'

const SERVER_ENDPOINTS = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

const API_DELAY_MS = 250
const PLAYER_EVENTS_LIMIT = 50

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchEvent(baseUrl, eventId) {
  const url = `${baseUrl}/events/${eventId}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-backfill/1.0' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPlayerEvents(baseUrl, playerId, kind) {
  const url = `${baseUrl}/players/${encodeURIComponent(playerId)}/${kind}?range=month&limit=${PLAYER_EVENTS_LIMIT}&offset=0`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-backfill/1.0' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function resolveServer(db, guildId) {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'albion_server')
    .maybeSingle()
  return data?.value && SERVER_ENDPOINTS[data.value] ? data.value : 'east'
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: guilds, error: gErr } = await db
    .from('killboard_events')
    .select('guild_id')
    .is('battle_id', null)
    .limit(10_000)
  if (gErr) throw gErr
  const guildIds = Array.from(new Set((guilds ?? []).map((g) => g.guild_id))).filter(Boolean)

  console.log(`[backfill] guilds_with_null_rows=${guildIds.length}`)

  let totalUpdated = 0
  let totalUnmatched = 0
  const allErrors = []

  for (const guildId of guildIds) {
    const { data: nullRows, error: qErr } = await db
      .from('killboard_events')
      .select('albion_player_id, event_id')
      .eq('guild_id', guildId)
      .is('battle_id', null)
      .not('albion_player_id', 'is', null)
      .range(0, 99_999)
    if (qErr) {
      console.error(`[${guildId}] query error:`, qErr.message)
      continue
    }
    const nullCount = nullRows?.length ?? 0
    const playerIds = Array.from(
      new Set(
        (nullRows ?? [])
          .map((r) => r.albion_player_id)
          .filter((id) => typeof id === 'string' && id.length > 0),
      ),
    )
    if (playerIds.length === 0) {
      console.log(`[${guildId}] nothing to backfill`)
      continue
    }

    const server = await resolveServer(db, guildId)
    const baseUrl = SERVER_ENDPOINTS[server] ?? SERVER_ENDPOINTS.east
    console.log(`[${guildId}] null_rows=${nullCount} players=${playerIds.length} server=${server}`)

    const eventToBattle = new Map()
    let pIdx = 0
    for (const playerId of playerIds) {
      pIdx += 1
      try {
        const kills = await fetchPlayerEvents(baseUrl, playerId, 'kills')
        await sleep(API_DELAY_MS)
        const deaths = await fetchPlayerEvents(baseUrl, playerId, 'deaths')
        await sleep(API_DELAY_MS)
        for (const e of [...kills, ...deaths]) {
          if (typeof e?.EventId === 'number' && typeof e?.BattleId === 'number') {
            eventToBattle.set(e.EventId, e.BattleId)
          }
        }
      } catch (e) {
        allErrors.push({ guildId, playerId, message: e?.message ?? String(e) })
      }
      if (pIdx % 10 === 0) {
        console.log(`  player ${pIdx}/${playerIds.length} resolved_events=${eventToBattle.size}`)
      }
    }

    let updated = 0
    let uIdx = 0
    for (const [eventId, battleId] of eventToBattle) {
      uIdx += 1
      const { error, count } = await db
        .from('killboard_events')
        .update({ battle_id: battleId }, { count: 'exact' })
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .is('battle_id', null)
      if (error) {
        allErrors.push({ guildId, eventId, message: error.message })
      } else {
        updated += count ?? 0
      }
      if (uIdx % 50 === 0) {
        console.log(`  update ${uIdx}/${eventToBattle.size} updated=${updated}`)
      }
    }
    // 2단계: /players API range=month 윈도우 밖의 행은 /events/{id} 로 직접
    // 채운다. 30일 이상 된 historical 데이터는 player feed 에 없어 이 경로만 가능.
    const { data: stillNullRows } = await db
      .from('killboard_events')
      .select('event_id')
      .eq('guild_id', guildId)
      .is('battle_id', null)
      .range(0, 99_999)
    const stillNullEventIds = Array.from(
      new Set(
        (stillNullRows ?? [])
          .map((r) => r.event_id)
          .filter((id) => typeof id === 'number'),
      ),
    )
    let stage2Updated = 0
    if (stillNullEventIds.length > 0) {
      console.log(`[${guildId}] stage2: events_api fallback for ${stillNullEventIds.length} events`)
      let s2Idx = 0
      for (const eventId of stillNullEventIds) {
        s2Idx += 1
        const ev = await fetchEvent(baseUrl, eventId)
        await sleep(API_DELAY_MS)
        if (!ev || typeof ev.BattleId !== 'number') continue
        const { error, count } = await db
          .from('killboard_events')
          .update({ battle_id: ev.BattleId }, { count: 'exact' })
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .is('battle_id', null)
        if (error) {
          allErrors.push({ guildId, eventId, message: error.message })
        } else {
          stage2Updated += count ?? 0
        }
        if (s2Idx % 50 === 0) {
          console.log(`  stage2 ${s2Idx}/${stillNullEventIds.length} updated=${stage2Updated}`)
        }
      }
    }

    const finalUpdated = updated + stage2Updated
    const unmatched = Math.max(0, nullCount - finalUpdated)
    totalUpdated += finalUpdated
    totalUnmatched += unmatched
    console.log(`[${guildId}] done: stage1=${updated} stage2=${stage2Updated} total=${finalUpdated} still_null=${unmatched}`)
  }

  console.log(`\n[backfill] TOTAL updated=${totalUpdated} still_null=${totalUnmatched} errors=${allErrors.length}`)
  if (allErrors.length > 0) {
    console.log(JSON.stringify(allErrors.slice(0, 5), null, 2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
