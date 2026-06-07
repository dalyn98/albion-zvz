import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AppSettingRow {
  key: string
  value: string
}

const eqCalls: Array<{ column: string; value: unknown }> = []
let nextResult: { data: AppSettingRow[] | null; error: unknown } = { data: [], error: null }

function makeQuery() {
  return {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value })
      return Promise.resolve(nextResult)
    },
  }
}

const fromMock = vi.fn(() => ({
  select() {
    return makeQuery()
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: fromMock }),
}))

// React's `cache` is a no-op outside RSC context, so each call hits supabase fresh.
import { getAppSetting } from './app-settings'

describe('getAppSetting', () => {
  beforeEach(() => {
    eqCalls.length = 0
    fromMock.mockClear()
    nextResult = { data: [], error: null }
  })

  it('returns the value when key is present', async () => {
    nextResult = {
      data: [{ key: 'albion_server', value: 'east' }],
      error: null,
    }
    const result = await getAppSetting('albion_server', 'west', 'tenant-1')
    expect(result).toBe('east')
  })

  it('returns fallback when key is absent', async () => {
    nextResult = { data: [], error: null }
    const result = await getAppSetting('albion_server', 'east', 'tenant-1')
    expect(result).toBe('east')
  })

  it('throws on DB error instead of hiding it behind fallback', async () => {
    nextResult = { data: null, error: { code: 'PGRST002', message: 'db down' } }
    await expect(getAppSetting('albion_server', 'west', 'tenant-1')).rejects.toThrow(
      /App settings lookup failed \(PGRST002\): db down/,
    )
  })

  it('scopes lookup by guildId (tenant isolation)', async () => {
    nextResult = { data: [], error: null }
    await getAppSetting('albion_server', '', 'tenant-XYZ')
    const guildIdEq = eqCalls.find((c) => c.column === 'guild_id')
    expect(guildIdEq?.value).toBe('tenant-XYZ')
  })

  it('queries the app_settings table', async () => {
    nextResult = { data: [], error: null }
    await getAppSetting('albion_server', '', 'tenant-1')
    expect(fromMock).toHaveBeenCalledWith('app_settings')
  })
})
