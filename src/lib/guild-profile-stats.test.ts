import { describe, it, expect, vi, beforeEach } from 'vitest'

const settings: Record<string, string> = {}
const getAppSettingMock = vi.fn<(k: string, f: string, g: string) => Promise<string>>(
  async (k, f) => settings[k] ?? f,
)

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: (k: string, f: string, g: string) => getAppSettingMock(k, f, g),
}))

// Battle bundling — passthrough so we directly drive `home_kills` etc.
vi.mock('@/lib/battle-bundling', () => ({
  bundleSplitBattles: (rows: unknown[]) =>
    (rows as Array<{
      outcome: string
      home_kills: number
      home_deaths: number
      home_team_size: number
    }>).map((r) => ({
      outcome: r.outcome,
      homeKills: r.home_kills,
      homeDeaths: r.home_deaths,
      homeTeamSize: r.home_team_size,
    })),
}))

// High-engagement filter — pass through (we test the math under the filter).
vi.mock('@/lib/low-engagement-cut', () => ({
  isHighEngagement: () => true,
}))

vi.mock('@/lib/weapon-category', () => ({
  extractWeaponCategory: (s: string) => (s.startsWith('NONE_') ? null : s.split('_')[0]),
}))

const { fetchTrackedBattleWindowsMock } = vi.hoisted(() => ({
  fetchTrackedBattleWindowsMock: vi.fn(async () => ({
    windows: [{ from: 0, to: Infinity, battleIds: new Set<number>() }],
  })),
}))

vi.mock('@/lib/tracked-kills', () => ({
  fetchTrackedBattleWindows: fetchTrackedBattleWindowsMock,
  isWithinTrackedWindow: () => true,
}))

vi.mock('@/lib/discord-avatar', () => ({
  discordAvatarUrl: (id: string) => `https://example.test/avatar/${id}`,
}))

const { getGuildMock } = vi.hoisted(() => ({ getGuildMock: vi.fn() }))

vi.mock('@/lib/albion-gameinfo', async (orig) => {
  const real: typeof import('@/lib/albion-gameinfo') = await orig()
  return {
    ...real,
    isAlbionServer: (s: string) => s === 'east' || s === 'west' || s === 'europe',
    getGuild: getGuildMock,
  }
})

type Row = Record<string, unknown>
let battleRecords: Row[] = []
let killboardEvents: Row[] = []
let adminAvatars: Row[] = []

interface QueryShape {
  data: Row[] | null
  error: { message: string } | null
}

interface QueryChain {
  select: () => QueryChain
  eq: () => QueryChain
  gte: () => QueryChain
  is: () => QueryChain
  not: () => QueryChain
  order: () => Promise<QueryShape>
  then: (onFulfilled: (v: QueryShape) => unknown) => Promise<unknown>
}

function chain(resolver: () => QueryShape): QueryChain {
  // Chain handles all common terminal patterns. Each .eq / .gte / .is / .not /
  // .order returns the same chain; data is resolved when awaited as a promise
  // (then-able).
  const c: QueryChain = {
    select: () => c,
    eq: () => c,
    gte: () => c,
    is: () => c,
    not: () => c,
    order: () => Promise.resolve(resolver()),
    then: (onFulfilled) => Promise.resolve(resolver()).then(onFulfilled),
  }
  return c
}

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'tenant_battle_records') {
        return chain(() => ({ data: battleRecords, error: null }))
      }
      if (table === 'killboard_events') {
        return chain(() => ({ data: killboardEvents, error: null }))
      }
      if (table === 'guild_avatars') {
        return chain(() => ({ data: adminAvatars, error: null }))
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

import {
  loadLifetimeBattleStats,
  loadTopWeaponCategoriesLast30d,
  loadTopRivalsLast30d,
  loadAdminTeam,
  resolveProfileServer,
} from './guild-profile-stats'

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k]
  getAppSettingMock.mockClear()
  battleRecords = []
  killboardEvents = []
  adminAvatars = []
  getGuildMock.mockReset()
})

describe('loadLifetimeBattleStats', () => {
  it('returns zeros for an empty record set', async () => {
    const s = await loadLifetimeBattleStats('tenant-1')
    expect(s).toEqual({
      kills: 0,
      deaths: 0,
      kdRatio: null,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: null,
      evaluatedBattles: 0,
    })
  })

  it('sums kills/deaths and computes K/D and win-rate (ties excluded from rate)', async () => {
    battleRecords = [
      { outcome: 'win', home_kills: 10, home_deaths: 2, home_team_size: 20, main_opponent_team_size: 20 },
      { outcome: 'loss', home_kills: 5, home_deaths: 8, home_team_size: 20, main_opponent_team_size: 20 },
      { outcome: 'tie', home_kills: 3, home_deaths: 3, home_team_size: 20, main_opponent_team_size: 20 },
    ]
    const s = await loadLifetimeBattleStats('tenant-1')
    expect(s.kills).toBe(18)
    expect(s.deaths).toBe(13)
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(1)
    expect(s.ties).toBe(1)
    expect(s.kdRatio).toBeCloseTo(18 / 13, 3)
    expect(s.winRate).toBeCloseTo(0.5, 3)
    expect(s.evaluatedBattles).toBe(3)
  })

  it('returns kills as ratio when deaths=0 (no Infinity)', async () => {
    battleRecords = [
      { outcome: 'win', home_kills: 7, home_deaths: 0, home_team_size: 20, main_opponent_team_size: 20 },
    ]
    const s = await loadLifetimeBattleStats('tenant-1')
    expect(s.kdRatio).toBe(7)
  })
})

describe('loadTopWeaponCategoriesLast30d', () => {
  it('returns empty when there are no tracked windows', async () => {
    fetchTrackedBattleWindowsMock.mockResolvedValueOnce({ windows: [] })
    killboardEvents = [
      { equipment: { MainHand: { Type: 'CAT_A_FIRESTAFF' } }, occurred_at: '2026-01-01T00:00:00Z', battle_id: 1 },
    ]
    const r = await loadTopWeaponCategoriesLast30d('tenant-1')
    expect(r).toEqual([])
  })

  it('aggregates by weapon category and sorts descending', async () => {
    // Mock extractWeaponCategory uses s.split('_')[0] — so first token is the bucket.
    killboardEvents = [
      { equipment: { MainHand: { Type: 'FIRE_T8' } }, occurred_at: '2026-04-01T00:00:00Z', battle_id: 1 },
      { equipment: { MainHand: { Type: 'FIRE_T7' } }, occurred_at: '2026-04-01T00:00:00Z', battle_id: 2 },
      { equipment: { MainHand: { Type: 'HOLY_T8' } }, occurred_at: '2026-04-01T00:00:00Z', battle_id: 3 },
    ]
    const r = await loadTopWeaponCategoriesLast30d('tenant-1')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].count).toBeGreaterThanOrEqual(r[r.length - 1].count)
    // Top bucket is 'FIRE' (count 2); 'HOLY' is second (count 1).
    expect(r[0].category).toBe('FIRE')
    expect(r[0].count).toBe(2)
  })

  it('skips rows whose MainHand.Type is missing', async () => {
    killboardEvents = [
      { equipment: null, occurred_at: '2026-04-01T00:00:00Z', battle_id: 1 },
      { equipment: { MainHand: null }, occurred_at: '2026-04-01T00:00:00Z', battle_id: 2 },
      { equipment: { MainHand: { Type: 'NONE_TOOL' } }, occurred_at: '2026-04-01T00:00:00Z', battle_id: 3 },
    ]
    const r = await loadTopWeaponCategoriesLast30d('tenant-1')
    expect(r).toEqual([])
  })

  it('caps result count at TOP_WEAPONS (5)', async () => {
    killboardEvents = Array.from({ length: 10 }, (_, i) => ({
      equipment: { MainHand: { Type: `T8_WEAPON_KIND${i}` } },
      occurred_at: '2026-04-01T00:00:00Z',
      battle_id: i,
    }))
    const r = await loadTopWeaponCategoriesLast30d('tenant-1')
    expect(r.length).toBeLessThanOrEqual(5)
  })
})

describe('loadTopRivalsLast30d', () => {
  it('returns empty for no battles', async () => {
    expect(await loadTopRivalsLast30d('tenant-1')).toEqual([])
  })

  it('aggregates by opponent name with win/loss/tie split', async () => {
    battleRecords = [
      { primary_opponent_name: 'EvilCorp', outcome: 'win' },
      { primary_opponent_name: 'EvilCorp', outcome: 'win' },
      { primary_opponent_name: 'EvilCorp', outcome: 'loss' },
      { primary_opponent_name: 'OtherGuild', outcome: 'loss' },
    ]
    const r = await loadTopRivalsLast30d('tenant-1')
    expect(r[0].guildName).toBe('EvilCorp')
    expect(r[0]).toMatchObject({ wins: 2, losses: 1, ties: 0, battleCount: 3 })
    expect(r[1].guildName).toBe('OtherGuild')
    expect(r[1].battleCount).toBe(1)
  })

  it('skips rows with empty / null opponent names', async () => {
    battleRecords = [
      { primary_opponent_name: null, outcome: 'win' },
      { primary_opponent_name: '   ', outcome: 'loss' },
    ]
    expect(await loadTopRivalsLast30d('tenant-1')).toEqual([])
  })

  it('caps result count at TOP_RIVALS (3)', async () => {
    battleRecords = Array.from({ length: 10 }, (_, i) => ({
      primary_opponent_name: `Guild-${i}`,
      outcome: 'win',
    }))
    const r = await loadTopRivalsLast30d('tenant-1')
    expect(r.length).toBeLessThanOrEqual(3)
  })
})

describe('loadAdminTeam', () => {
  it('returns empty when no admins', async () => {
    expect(await loadAdminTeam('tenant-1')).toEqual([])
  })

  it('maps admins to public team entries', async () => {
    adminAvatars = [
      { discord_id: 'a', username: 'admin-a', avatar: null, public_discord_handle: 'admin#1' },
      { discord_id: 'b', username: 'admin-b', avatar: null, public_discord_handle: null },
      { discord_id: null, username: 'should-skip', avatar: null, public_discord_handle: null },
    ]
    const r = await loadAdminTeam('tenant-1')
    expect(r.length).toBe(2)
    expect(r[0].publicDiscordHandle).toBe('admin#1')
    expect(r[1].publicDiscordHandle).toBeNull()
    expect(r[0].avatarUrl).toMatch(/avatar\/a/)
  })

  it('treats whitespace-only public_discord_handle as null', async () => {
    adminAvatars = [
      { discord_id: 'a', username: 'admin-a', avatar: null, public_discord_handle: '   ' },
    ]
    const r = await loadAdminTeam('tenant-1')
    expect(r[0].publicDiscordHandle).toBeNull()
  })
})

describe('resolveProfileServer', () => {
  it('returns the override when it is a valid Albion server', async () => {
    expect(await resolveProfileServer('tenant-1', 'west')).toBe('west')
  })

  it('falls back to tenant albion_server setting when override invalid', async () => {
    settings.albion_server = 'east'
    expect(await resolveProfileServer('tenant-1', 'banana')).toBe('east')
  })

  it('returns null when neither override nor setting is valid (no hard "east" default)', async () => {
    settings.albion_server = 'banana'
    expect(await resolveProfileServer('tenant-1', '')).toBeNull()
  })

  it('returns null when setting is empty', async () => {
    expect(await resolveProfileServer('tenant-1', '')).toBeNull()
  })
})
