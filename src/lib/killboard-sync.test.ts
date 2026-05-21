import { describe, it, expect, vi, beforeEach } from 'vitest'

const resolveAlbionServerMock = vi.fn<(g: string) => Promise<'east' | 'west' | 'europe'>>()
const getAppSettingMock = vi.fn<(k: string, f: string, g: string) => Promise<string>>(
  async (_k, fallback) => fallback,
)
const fetchJsonWithRetryMock = vi.fn()

vi.mock('@/lib/killboard', () => ({
  resolveAlbionServer: (g: string) => resolveAlbionServerMock(g),
}))
vi.mock('@/lib/app-settings', () => ({
  getAppSetting: (k: string, f: string, g: string) => getAppSettingMock(k, f, g),
}))
vi.mock('@/lib/http-retry', () => ({
  fetchJsonWithRetry: (...args: unknown[]) => fetchJsonWithRetryMock(...args),
}))
vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastGuildEvent: vi.fn(async () => undefined),
}))

import { syncKillboard } from './killboard-sync'
import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal supabase-client stub. Each `from()` call returns a chain whose
// terminal method (`order`, `is`, `upsert`) resolves with the data the test
// scripted ahead of time.
interface QueryScript {
  guildAvatarsResult: () => Promise<{ data: unknown; error: { message: string } | null }>
  albionOnlyResult: () => Promise<{ data: unknown; error: { message: string } | null }>
  upsertResult: (
    rows?: unknown,
    options?: unknown,
  ) => Promise<{ data: unknown; error: { message: string } | null; count: number }>
  updateResult?: () => Promise<{ error: { message: string } | null }>
}

function makeDb(script: QueryScript): SupabaseClient {
  const updateChain = () => ({
    eq: () => ({
      eq: () => (script.updateResult ? script.updateResult() : Promise.resolve({ error: null })),
    }),
  })
  const guildAvatarsChain = () => ({
    select: () => ({
      eq: () => ({
        order: script.guildAvatarsResult,
      }),
    }),
    update: () => updateChain(),
  })
  const albionOnlyChain = () => ({
    select: () => ({
      eq: () => ({
        is: script.albionOnlyResult,
      }),
    }),
  })
  const killboardChain = () => ({
    upsert: (rows?: unknown, options?: unknown) => script.upsertResult(rows, options),
  })
  return {
    from: (table: string) => {
      if (table === 'guild_avatars') return guildAvatarsChain() as never
      if (table === 'albion_guild_members') return albionOnlyChain() as never
      if (table === 'killboard_events') return killboardChain() as never
      throw new Error(`unexpected table: ${table}`)
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  resolveAlbionServerMock.mockReset()
  getAppSettingMock.mockReset().mockImplementation(async (_k, f) => f)
  fetchJsonWithRetryMock.mockReset()
})

describe('syncKillboard early-skip behavior', () => {
  it('skips cleanly when albion_server is not configured (no silent east fallback)', async () => {
    resolveAlbionServerMock.mockRejectedValue(new Error('albion_server not configured'))
    const db = makeDb({
      guildAvatarsResult: async () => ({ data: [], error: null }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async () => ({ data: null, error: null, count: 0 }),
    })

    const result = await syncKillboard(db, 'tenant-1')

    expect(result.server).toBeNull()
    expect(result.members_total).toBe(0)
    expect(result.events_upserted).toBe(0)
    expect(result.errors).toEqual([
      { member: '*', step: 'config', message: 'albion_server not configured for tenant' },
    ])
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    // No fetches should have happened.
    expect(fetchJsonWithRetryMock).not.toHaveBeenCalled()
  })

  it('skips when albion_home_guild_name is empty', async () => {
    resolveAlbionServerMock.mockResolvedValue('east')
    getAppSettingMock.mockResolvedValue('') // guild name unset
    const db = makeDb({
      guildAvatarsResult: async () => ({ data: [], error: null }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async () => ({ data: null, error: null, count: 0 }),
    })

    const result = await syncKillboard(db, 'tenant-1')

    expect(result.server).toBe('east')
    expect(result.members_total).toBe(0)
    expect(result.errors).toEqual([
      { member: '*', step: 'config', message: 'albion_home_guild_name not configured for tenant' },
    ])
    expect(fetchJsonWithRetryMock).not.toHaveBeenCalled()
  })

  it('passes guildId through to resolveAlbionServer (tenant isolation)', async () => {
    resolveAlbionServerMock.mockRejectedValue(new Error('albion_server not configured'))
    const db = makeDb({
      guildAvatarsResult: async () => ({ data: [], error: null }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async () => ({ data: null, error: null, count: 0 }),
    })

    await syncKillboard(db, 'tenant-XYZ')

    expect(resolveAlbionServerMock).toHaveBeenCalledWith('tenant-XYZ')
  })

  it('reads guildName from app-settings scoped to guildId', async () => {
    resolveAlbionServerMock.mockResolvedValue('east')
    getAppSettingMock.mockResolvedValue('') // still empty → skip
    const db = makeDb({
      guildAvatarsResult: async () => ({ data: [], error: null }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async () => ({ data: null, error: null, count: 0 }),
    })

    await syncKillboard(db, 'tenant-XYZ')

    const calls = getAppSettingMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][0]).toBe('albion_home_guild_name')
    expect(calls[0][2]).toBe('tenant-XYZ')
  })

  it('completes a no-op run when both config present but no members exist', async () => {
    resolveAlbionServerMock.mockResolvedValue('west')
    getAppSettingMock.mockResolvedValue('My Guild')
    const db = makeDb({
      guildAvatarsResult: async () => ({ data: [], error: null }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async () => ({ data: null, error: null, count: 0 }),
    })

    const result = await syncKillboard(db, 'tenant-1')

    expect(result.server).toBe('west')
    expect(result.members_total).toBe(0)
    expect(result.events_upserted).toBe(0)
    expect(result.errors).toEqual([])
    expect(fetchJsonWithRetryMock).not.toHaveBeenCalled()
  })

  it('upserts killboard rows with the tenant-scoped conflict target', async () => {
    resolveAlbionServerMock.mockResolvedValue('west')
    getAppSettingMock.mockResolvedValue('My Guild')
    fetchJsonWithRetryMock.mockImplementation(async (url: string) => {
      if (url.includes('/kills?')) {
        return [
          {
            EventId: 12345,
            TimeStamp: '2026-05-01T00:00:00Z',
            TotalVictimKillFame: 1000,
            BattleId: 67890,
            Killer: {
              Id: 'player-1',
              Name: 'Player',
              GuildId: 'guild-1',
              GuildName: 'My Guild',
              AllianceId: null,
              AllianceName: null,
              AverageItemPower: 1400.4,
              Equipment: { MainHand: { Type: 'T8_MAIN_FIRESTAFF' } },
            },
            Victim: {
              Id: 'enemy-1',
              Name: 'Enemy',
              GuildId: 'guild-2',
              GuildName: 'Enemy Guild',
              AllianceId: null,
              AllianceName: 'Enemy Alliance',
              AverageItemPower: 1300,
              Equipment: null,
            },
          },
        ]
      }
      if (url.includes('/deaths?')) return []
      throw new Error(`unexpected URL: ${url}`)
    })
    const upsertCalls: Array<{ rows: unknown; options: unknown }> = []
    const db = makeDb({
      guildAvatarsResult: async () => ({
        data: [{ discord_id: 'discord-1', username: 'Player', albion_player_id: 'player-1' }],
        error: null,
      }),
      albionOnlyResult: async () => ({ data: [], error: null }),
      upsertResult: async (rows, options) => {
        upsertCalls.push({ rows, options })
        return { data: null, error: null, count: Array.isArray(rows) ? rows.length : 0 }
      },
    })

    const result = await syncKillboard(db, 'tenant-1')

    expect(result.events_upserted).toBe(1)
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].options).toMatchObject({
      onConflict: 'guild_id,event_id,role',
      ignoreDuplicates: true,
      count: 'exact',
    })
    expect(Array.isArray(upsertCalls[0].rows)).toBe(true)
    expect((upsertCalls[0].rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      guild_id: 'tenant-1',
      event_id: 12345,
      role: 'killer',
      battle_id: 67890,
    })
  })
})
