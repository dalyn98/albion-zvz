import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAppSetting = vi.fn<(key: string, fallback: string, tenantId: string) => Promise<string>>()

vi.mock('./app-settings', () => ({
  getAppSetting: (key: string, fallback: string, tenantId: string) =>
    getAppSetting(key, fallback, tenantId),
}))

import { resolveAlbionDisplayName } from './albion-display-name'

describe('resolveAlbionDisplayName', () => {
  beforeEach(() => {
    getAppSetting.mockReset()
  })

  it('returns trimmed albion_home_guild_name when set', async () => {
    getAppSetting.mockResolvedValue('  Knights Of Albion  ')
    const result = await resolveAlbionDisplayName('t1', 'jelda-pl9c', 'Discord Guild')
    expect(result).toBe('Knights Of Albion')
  })

  it('falls back to displayName from slug when albion name is empty', async () => {
    getAppSetting.mockResolvedValue('')
    const result = await resolveAlbionDisplayName('t1', 'jelda-pl9c', 'Discord Guild')
    expect(result).toBe('Jelda')
  })

  it('falls back to discord fallback when albion empty AND slug yields empty', async () => {
    getAppSetting.mockResolvedValue('')
    const result = await resolveAlbionDisplayName('t1', '', 'Discord Guild')
    expect(result).toBe('Discord Guild')
  })

  it('treats whitespace-only albion name as unset', async () => {
    getAppSetting.mockResolvedValue('   ')
    const result = await resolveAlbionDisplayName('t1', 'menhera', 'Discord Guild')
    expect(result).toBe('Menhera')
  })

  it('passes the tenantId through to getAppSetting', async () => {
    getAppSetting.mockResolvedValue('Albion Name')
    await resolveAlbionDisplayName('tenant-42', 'menhera', 'Fallback')
    expect(getAppSetting).toHaveBeenCalledWith('albion_home_guild_name', '', 'tenant-42')
  })
})
