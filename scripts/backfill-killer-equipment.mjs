#!/usr/bin/env node
// 일회성 백필. killboard_events 의 role='killer' + equipment=null 행 중
// tenant_battle_records 창 안에 있는 것만 Albion /events/{id} 로 재요청해
// Killer.Equipment 를 채운다.
// 사용: node --env-file=.env.local scripts/backfill-killer-equipment.mjs [--all]

import { createClient } from '@supabase/supabase-js'

const SERVER_ENDPOINTS = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

const API_DELAY_MS = 250

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchEvent(baseUrl, eventId) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${baseUrl}/events/${eventId}`, {
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
    process.exit(1)
  }
  const scope = process.argv.includes('--all') ? 'all' : 'tracked'
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: guilds, error: gErr } = await db
    .from('tenant_battle_records')
    .select('guild_id')
    .limit(1000)
  if (gErr) throw gErr
  const guildIds = Array.from(new Set((guilds ?? []).map((g) => g.guild_id))).filter(Boolean)

  console.log(`[backfill] scope=${scope} guilds=${guildIds.length}`)

  let totalUpdated = 0
  const allErrors = []

  for (const guildId of guildIds) {
    const { data: rows, error: qErr } =
      scope === 'tracked'
        ? await db.rpc('killboard_killer_rows_needing_equipment', { p_guild_id: guildId })
        : await db
            .from('killboard_events')
            .select('event_id')
            .eq('guild_id', guildId)
            .eq('role', 'killer')
            .is('equipment', null)
    if (qErr) {
      console.error(`[${guildId}] query error:`, qErr.message)
      continue
    }
    const eventIds = Array.from(
      new Set((rows ?? []).map((r) => r.event_id).filter((id) => typeof id === 'number')),
    )
    if (eventIds.length === 0) {
      console.log(`[${guildId}] nothing to backfill`)
      continue
    }

    const { data: settingRow } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'albion_server')
      .maybeSingle()
    const server = settingRow?.value || 'east'
    const baseUrl = SERVER_ENDPOINTS[server] ?? SERVER_ENDPOINTS.east

    console.log(`[${guildId}] candidates=${eventIds.length} server=${server}`)

    let updated = 0
    let missing = 0
    let idx = 0
    for (const eventId of eventIds) {
      idx += 1
      const event = await fetchEvent(baseUrl, eventId)
      await sleep(API_DELAY_MS)
      if (!event) {
        missing += 1
        continue
      }
      const killerEq = event?.Killer?.Equipment ?? null
      if (!killerEq) continue
      const { error, count } = await db
        .from('killboard_events')
        .update({ equipment: killerEq }, { count: 'exact' })
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .eq('role', 'killer')
        .is('equipment', null)
      if (error) {
        allErrors.push({ guildId, eventId, message: error.message })
      } else {
        updated += count ?? 0
      }
      if (idx % 20 === 0) {
        console.log(`  ${idx}/${eventIds.length} updated=${updated} missing=${missing}`)
      }
    }
    totalUpdated += updated
    console.log(`[${guildId}] done: updated=${updated} missing_remote=${missing}`)
  }

  console.log(`\n[backfill] TOTAL updated=${totalUpdated} errors=${allErrors.length}`)
  if (allErrors.length > 0) {
    console.log(JSON.stringify(allErrors.slice(0, 5), null, 2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
