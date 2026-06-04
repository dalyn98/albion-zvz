#!/usr/bin/env node
// Creates one synthetic battle record for visual inspection.
// Usage:
//   node --env-file=.env.local scripts/create-dummy-battle-record.mjs --slug menhera

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_SLUG = 'menhera'
const DEFAULT_BATTLE_ID = 9900603001

function loadEnvFile(file) {
  const full = path.resolve(process.cwd(), file)
  if (!fs.existsSync(full)) return
  const text = fs.readFileSync(full, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return fallback
  return process.argv[idx + 1] ?? fallback
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function makePlayers({ guildId, guildName, allianceId, allianceName, prefix, count, weapons }) {
  const out = {}
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-p${String(i + 1).padStart(2, '0')}`
    const weapon = weapons[i % weapons.length]
    out[id] = {
      id,
      name: `${prefix}${String(i + 1).padStart(2, '0')}`,
      guildId,
      guildName,
      allianceId,
      allianceName,
      kills: i === 0 ? 2 : i < 4 ? 1 : 0,
      deaths: i === 1 || i === 4 ? 1 : 0,
      killFame: 120000 + i * 35000,
      averageItemPower: 1380 + ((i * 37) % 180),
      equipment: { MainHand: { Type: weapon } },
    }
  }
  return out
}

function forceSummary({
  battleRecordId,
  level,
  kind,
  key,
  name,
  allianceId,
  allianceName,
  guildIds,
  guildNames,
  teamSize,
  kills,
  deaths,
  fame,
  ip,
}) {
  return {
    battle_record_id: battleRecordId,
    force_level: level,
    force_kind: kind,
    force_key: key,
    force_name: name,
    alliance_id: allianceId,
    alliance_name: allianceName,
    guild_ids: guildIds,
    guild_names: guildNames,
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: fame,
    average_item_power: ip,
  }
}

function forceEdge({
  battleRecordId,
  level,
  a,
  b,
  aKills,
  bKills,
  aFame,
  bFame,
  events,
}) {
  if (a.key > b.key) {
    return forceEdge({
      battleRecordId,
      level,
      a: b,
      b: a,
      aKills: bKills,
      bKills: aKills,
      aFame: bFame,
      bFame: aFame,
      events,
    })
  }
  return {
    battle_record_id: battleRecordId,
    force_level: level,
    force_a_key: a.key,
    force_a_kind: a.kind,
    force_a_name: a.name,
    force_a_team_size: a.teamSize,
    force_b_key: b.key,
    force_b_kind: b.kind,
    force_b_name: b.name,
    force_b_team_size: b.teamSize,
    a_kills: aKills,
    a_deaths: bKills,
    a_kill_fame: aFame,
    b_kills: bKills,
    b_deaths: aKills,
    b_kill_fame: bFame,
    event_count: events,
    is_meaningful: a.teamSize >= 10 && b.teamSize >= 10 && events > 0,
    confidence: a.teamSize >= 10 && b.teamSize >= 10 && events > 0 ? 'killboard_exact' : 'weak',
    evidence_source: 'killboard_events',
    evaluated_at: new Date().toISOString(),
  }
}

async function getSetting(db, guildId, key, fallback = '') {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return typeof data?.value === 'string' && data.value.trim() ? data.value.trim() : fallback
}

async function main() {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const slug = argValue('--slug', process.env.DUMMY_BATTLE_TENANT_SLUG ?? DEFAULT_SLUG)
  const battleId = Number(argValue('--battle-id', String(DEFAULT_BATTLE_ID)))
  if (!Number.isSafeInteger(battleId)) throw new Error('invalid --battle-id')

  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data: tenant, error: tenantErr } = await db
    .from('tenants')
    .select('id, slug, name, status')
    .eq('slug', slug)
    .maybeSingle()
  if (tenantErr) throw tenantErr
  if (!tenant || tenant.status !== 'active') throw new Error(`active tenant not found: ${slug}`)

  const homeGuildId = await getSetting(db, tenant.id, 'albion_home_guild_id')
  const homeGuildName = await getSetting(db, tenant.id, 'albion_home_guild_name', 'Menhera')
  const server = await getSetting(db, tenant.id, 'albion_server', 'east')
  if (!homeGuildId) throw new Error(`${slug} has no albion_home_guild_id setting`)
  if (!['west', 'east', 'europe'].includes(server)) throw new Error(`invalid albion_server: ${server}`)

  const startedAt = isoMinutesAgo(80)
  const endedAt = isoMinutesAgo(55)
  const homeAllianceId = 'dummy-rift-alliance'
  const homeAllianceName = 'RIFT-DUMMY'
  const homeAllyGuildId = 'dummy-rift-vanguard'
  const ironAllianceId = 'dummy-iron-alliance'
  const ironAllianceName = 'IRON-DUMMY'
  const enemyRedGuildId = 'dummy-crimson-order'
  const enemyBlueGuildId = 'dummy-iron-wolves'
  const scoutGuildId = 'dummy-mist-scouts'

  const homeWeapons = [
    'T8_2H_MACE@3',
    'T8_MAIN_HOLYSTAFF_AVALON@3',
    'T8_2H_ARCANE_RINGPAIR_AVALON@2',
    'T8_2H_ICECRYSTAL_UNDEAD@3',
  ]
  const enemyWeapons = [
    'T8_2H_DAGGERPAIR@3',
    'T8_2H_FIRESTAFF@2',
    'T8_2H_CROSSBOWLARGE@3',
    'T8_MAIN_CURSEDSTAFF@2',
  ]

  const players = {
    ...makePlayers({
      guildId: homeGuildId,
      guildName: homeGuildName,
      allianceId: homeAllianceId,
      allianceName: homeAllianceName,
      prefix: 'Home',
      count: 12,
      weapons: homeWeapons,
    }),
    ...makePlayers({
      guildId: homeAllyGuildId,
      guildName: 'RIFT Vanguard',
      allianceId: homeAllianceId,
      allianceName: homeAllianceName,
      prefix: 'Ally',
      count: 8,
      weapons: homeWeapons,
    }),
    ...makePlayers({
      guildId: enemyRedGuildId,
      guildName: 'Crimson Order',
      allianceId: ironAllianceId,
      allianceName: ironAllianceName,
      prefix: 'Red',
      count: 14,
      weapons: enemyWeapons,
    }),
    ...makePlayers({
      guildId: enemyBlueGuildId,
      guildName: 'Iron Wolves',
      allianceId: ironAllianceId,
      allianceName: ironAllianceName,
      prefix: 'Blue',
      count: 12,
      weapons: enemyWeapons,
    }),
    ...makePlayers({
      guildId: scoutGuildId,
      guildName: 'Mist Scouts',
      allianceId: null,
      allianceName: null,
      prefix: 'Scout',
      count: 4,
      weapons: ['T8_2H_BOW_KEEPER@1'],
    }),
  }

  const rawBattle = {
    id: battleId,
    startTime: startedAt,
    endTime: endedAt,
    timeout: isoMinutesAgo(50),
    totalFame: 14750000,
    totalKills: 12,
    clusterName: 'Dummy ZvZ Field',
    alliances: {
      [homeAllianceId]: { id: homeAllianceId, name: homeAllianceName, kills: 7, deaths: 5, killFame: 8400000 },
      [ironAllianceId]: { id: ironAllianceId, name: ironAllianceName, kills: 5, deaths: 7, killFame: 6200000 },
    },
    guilds: {
      [homeGuildId]: {
        id: homeGuildId,
        name: homeGuildName,
        alliance: homeAllianceName,
        allianceId: homeAllianceId,
        kills: 5,
        deaths: 4,
        killFame: 6100000,
      },
      [homeAllyGuildId]: {
        id: homeAllyGuildId,
        name: 'RIFT Vanguard',
        alliance: homeAllianceName,
        allianceId: homeAllianceId,
        kills: 2,
        deaths: 1,
        killFame: 2300000,
      },
      [enemyRedGuildId]: {
        id: enemyRedGuildId,
        name: 'Crimson Order',
        alliance: ironAllianceName,
        allianceId: ironAllianceId,
        kills: 3,
        deaths: 4,
        killFame: 3700000,
      },
      [enemyBlueGuildId]: {
        id: enemyBlueGuildId,
        name: 'Iron Wolves',
        alliance: ironAllianceName,
        allianceId: ironAllianceId,
        kills: 2,
        deaths: 3,
        killFame: 2500000,
      },
      [scoutGuildId]: {
        id: scoutGuildId,
        name: 'Mist Scouts',
        alliance: '',
        allianceId: '',
        kills: 0,
        deaths: 0,
        killFame: 50000,
      },
    },
    players,
  }

  const involvedGuildIds = Object.keys(rawBattle.guilds)
  const involvedAllianceIds = Object.keys(rawBattle.alliances)
  const { data: battleRecord, error: battleErr } = await db
    .from('battle_records')
    .upsert(
      {
        albion_server: server,
        albion_battle_id: battleId,
        started_at: startedAt,
        ended_at: endedAt,
        total_players: Object.keys(players).length,
        total_kills: rawBattle.totalKills,
        total_fame: rawBattle.totalFame,
        cluster_name: rawBattle.clusterName,
        involved_guild_ids: involvedGuildIds,
        involved_alliance_ids: involvedAllianceIds,
        raw_battle: rawBattle,
      },
      { onConflict: 'albion_server,albion_battle_id' },
    )
    .select('id')
    .single()
  if (battleErr) throw battleErr

  const battleRecordId = battleRecord.id
  const { data: tenantBattle, error: tenantBattleErr } = await db
    .from('tenant_battle_records')
    .upsert(
      {
        guild_id: tenant.id,
        battle_record_id: battleRecordId,
        home_guild_id: homeGuildId,
        home_guild_name: homeGuildName,
        home_alliance_id: homeAllianceId,
        home_alliance_name: homeAllianceName,
        home_team_size: 20,
        home_kills: 7,
        home_deaths: 5,
        home_kill_fame: 8400000,
        opponent_team_size: 30,
        opponent_kills: 5,
        opponent_deaths: 7,
        opponent_kill_fame: 6250000,
        opponent_guild_names: ['Crimson Order', 'Iron Wolves', 'Mist Scouts'],
        opponent_alliance_names: [ironAllianceName],
        primary_opponent_name: ironAllianceName,
        main_opponent_force_key: `a:${ironAllianceId}`,
        main_opponent_force_kind: 'alliance',
        main_opponent_force_name: ironAllianceName,
        main_opponent_alliance_id: ironAllianceId,
        main_opponent_team_size: 26,
        main_opponent_kills: 5,
        main_opponent_deaths: 7,
        main_opponent_kill_fame: 6200000,
        match_index: 1,
        match_total: 1,
        is_provisional: false,
        match_evaluated_at: new Date().toISOString(),
        size_category: 'small',
        outcome: 'win',
        outcome_method: 'fame_diff',
        started_at: startedAt,
      },
      { onConflict: 'guild_id,battle_record_id,main_opponent_force_key' },
    )
    .select('id')
    .single()
  if (tenantBattleErr) throw tenantBattleErr

  const rift = { key: `a:${homeAllianceId}`, kind: 'alliance', name: homeAllianceName, teamSize: 20 }
  const iron = { key: `a:${ironAllianceId}`, kind: 'alliance', name: ironAllianceName, teamSize: 26 }
  const home = { key: `g:${homeGuildId}`, kind: 'guild', name: homeGuildName, teamSize: 12 }
  const red = { key: `g:${enemyRedGuildId}`, kind: 'guild', name: 'Crimson Order', teamSize: 14 }
  const blue = { key: `g:${enemyBlueGuildId}`, kind: 'guild', name: 'Iron Wolves', teamSize: 12 }

  const summaries = [
    forceSummary({ battleRecordId, level: 'alliance', kind: 'alliance', key: rift.key, name: rift.name, allianceId: homeAllianceId, allianceName: homeAllianceName, guildIds: [homeGuildId, homeAllyGuildId], guildNames: [homeGuildName, 'RIFT Vanguard'], teamSize: 20, kills: 7, deaths: 5, fame: 8400000, ip: 1480 }),
    forceSummary({ battleRecordId, level: 'alliance', kind: 'alliance', key: iron.key, name: iron.name, allianceId: ironAllianceId, allianceName: ironAllianceName, guildIds: [enemyRedGuildId, enemyBlueGuildId], guildNames: ['Crimson Order', 'Iron Wolves'], teamSize: 26, kills: 5, deaths: 7, fame: 6200000, ip: 1455 }),
    forceSummary({ battleRecordId, level: 'alliance', kind: 'guild', key: `g:${scoutGuildId}`, name: 'Mist Scouts', allianceId: null, allianceName: null, guildIds: [scoutGuildId], guildNames: ['Mist Scouts'], teamSize: 4, kills: 0, deaths: 0, fame: 50000, ip: 1320 }),
    forceSummary({ battleRecordId, level: 'guild', kind: 'guild', key: home.key, name: home.name, allianceId: homeAllianceId, allianceName: homeAllianceName, guildIds: [homeGuildId], guildNames: [homeGuildName], teamSize: 12, kills: 5, deaths: 4, fame: 6100000, ip: 1490 }),
    forceSummary({ battleRecordId, level: 'guild', kind: 'guild', key: `g:${homeAllyGuildId}`, name: 'RIFT Vanguard', allianceId: homeAllianceId, allianceName: homeAllianceName, guildIds: [homeAllyGuildId], guildNames: ['RIFT Vanguard'], teamSize: 8, kills: 2, deaths: 1, fame: 2300000, ip: 1465 }),
    forceSummary({ battleRecordId, level: 'guild', kind: 'guild', key: red.key, name: red.name, allianceId: ironAllianceId, allianceName: ironAllianceName, guildIds: [enemyRedGuildId], guildNames: ['Crimson Order'], teamSize: 14, kills: 3, deaths: 4, fame: 3700000, ip: 1460 }),
    forceSummary({ battleRecordId, level: 'guild', kind: 'guild', key: blue.key, name: blue.name, allianceId: ironAllianceId, allianceName: ironAllianceName, guildIds: [enemyBlueGuildId], guildNames: ['Iron Wolves'], teamSize: 12, kills: 2, deaths: 3, fame: 2500000, ip: 1440 }),
    forceSummary({ battleRecordId, level: 'guild', kind: 'guild', key: `g:${scoutGuildId}`, name: 'Mist Scouts', allianceId: null, allianceName: null, guildIds: [scoutGuildId], guildNames: ['Mist Scouts'], teamSize: 4, kills: 0, deaths: 0, fame: 50000, ip: 1320 }),
  ]
  const edges = [
    forceEdge({ battleRecordId, level: 'alliance', a: rift, b: iron, aKills: 7, bKills: 5, aFame: 8400000, bFame: 6200000, events: 12 }),
    forceEdge({ battleRecordId, level: 'guild', a: home, b: red, aKills: 4, bKills: 3, aFame: 4700000, bFame: 3700000, events: 7 }),
    forceEdge({ battleRecordId, level: 'guild', a: home, b: blue, aKills: 1, bKills: 1, aFame: 1400000, bFame: 900000, events: 2 }),
  ]

  await db.from('battle_force_summaries').delete().eq('battle_record_id', battleRecordId)
  await db.from('battle_force_edges').delete().eq('battle_record_id', battleRecordId)
  const { error: summaryErr } = await db
    .from('battle_force_summaries')
    .upsert(summaries, { onConflict: 'battle_record_id,force_level,force_key' })
  if (summaryErr) throw summaryErr
  const { error: edgeErr } = await db
    .from('battle_force_edges')
    .upsert(edges, { onConflict: 'battle_record_id,force_level,force_a_key,force_b_key' })
  if (edgeErr) throw edgeErr

  console.log(JSON.stringify({
    tenant: tenant.slug,
    tenant_name: tenant.name,
    battle_record_id: battleRecordId,
    tenant_battle_record_id: tenantBattle.id,
    albion_battle_id: battleId,
    url_path: `/battles/${tenantBattle.id}`,
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
