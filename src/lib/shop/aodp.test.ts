import { describe, it, expect, vi, beforeEach } from 'vitest'

const settings: Record<string, string> = {}

const getAppSettingMock = vi.fn<(key: string, fallback: string, guildId: string) => Promise<string>>(
  async (key, fallback) => settings[key] ?? fallback,
)

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: (k: string, f: string, g: string) => getAppSettingMock(k, f, g),
}))

import { loadAodpOptions, inventoryKey } from './aodp'

describe('inventoryKey', () => {
  it('formats (uniqueName, enchant, quality) deterministically', () => {
    expect(inventoryKey('T8_2H_INFERNOSTAFF', 4, 3)).toBe('T8_2H_INFERNOSTAFF|4|3')
    expect(inventoryKey('T4_BAG', 0, 1)).toBe('T4_BAG|0|1')
  })

  it('preserves enchant=0 as "0" in the key', () => {
    expect(inventoryKey('T4_BAG', 0, 2)).toContain('|0|')
  })
})

describe('loadAodpOptions', () => {
  beforeEach(() => {
    for (const k of Object.keys(settings)) delete settings[k]
    getAppSettingMock.mockClear()
  })

  it('throws when albion_server is unconfigured (no silent east fallback)', async () => {
    await expect(loadAodpOptions('tenant-1')).rejects.toThrow(/albion_server not configured/)
  })

  it('parses a valid configuration', async () => {
    settings.albion_server = 'west'
    settings.aodp_cities = JSON.stringify(['Caerleon'])
    settings.aodp_price_mode = 'avg_3d'
    settings.aodp_min_quality = '2'
    settings.aodp_quality_agnostic = 'true'
    const opts = await loadAodpOptions('tenant-1')
    expect(opts.server).toBe('west')
    expect(opts.cities).toEqual(['Caerleon'])
    expect(opts.primaryCity).toBe('Caerleon')
    expect(opts.mode).toBe('avg_3d')
    expect(opts.minQuality).toBe(2)
    expect(opts.qualityAgnostic).toBe(true)
  })

  it('falls back to defaults for invalid or missing optional fields', async () => {
    settings.albion_server = 'east'
    settings.aodp_cities = 'not-json'
    settings.aodp_price_mode = 'weird-mode'
    settings.aodp_min_quality = '99'
    settings.aodp_quality_agnostic = 'maybe'
    const opts = await loadAodpOptions('tenant-1')
    expect(opts.mode).toBe('spot')
    expect(opts.minQuality).toBe(1)
    expect(opts.qualityAgnostic).toBe(false)
    // Cities falls back to default royal city set.
    expect(opts.cities.length).toBeGreaterThan(0)
  })

  it('rejects cities containing disallowed names', async () => {
    settings.albion_server = 'east'
    settings.aodp_cities = JSON.stringify(['Caerleon', 'BlackMarket'])
    const opts = await loadAodpOptions('tenant-1')
    // BlackMarket would be ignored → cities falls back to defaults.
    expect(opts.cities).not.toContain('BlackMarket')
  })

  it('clamps minQuality to [1..5]', async () => {
    settings.albion_server = 'east'

    settings.aodp_min_quality = '0'
    expect((await loadAodpOptions('t1')).minQuality).toBe(1)

    settings.aodp_min_quality = '6'
    expect((await loadAodpOptions('t1')).minQuality).toBe(1)

    settings.aodp_min_quality = '3'
    expect((await loadAodpOptions('t1')).minQuality).toBe(3)
  })

  it('passes guildId through to all settings reads (tenant isolation)', async () => {
    settings.albion_server = 'east'
    await loadAodpOptions('tenant-XYZ')
    const guildIds = getAppSettingMock.mock.calls.map((c) => c[2])
    expect(new Set(guildIds)).toEqual(new Set(['tenant-XYZ']))
  })
})
