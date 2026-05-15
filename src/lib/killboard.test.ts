import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAppSettingMock = vi.fn<(key: string, fallback: string, guildId: string) => Promise<string>>()

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: (key: string, fallback: string, guildId: string) =>
    getAppSettingMock(key, fallback, guildId),
}))

import { resolveAlbionServer } from './killboard'

describe('resolveAlbionServer', () => {
  beforeEach(() => {
    getAppSettingMock.mockReset()
  })

  it('returns the configured server for valid values', async () => {
    for (const server of ['east', 'west', 'europe'] as const) {
      getAppSettingMock.mockResolvedValueOnce(server)
      const result = await resolveAlbionServer('tenant-1')
      expect(result).toBe(server)
    }
  })

  it('throws when albion_server is unset (no silent east fallback)', async () => {
    getAppSettingMock.mockResolvedValueOnce('')
    await expect(resolveAlbionServer('tenant-1')).rejects.toThrow(
      /albion_server not configured/,
    )
  })

  it('throws on invalid values to prevent silent misconfig', async () => {
    getAppSettingMock.mockResolvedValueOnce('north')
    await expect(resolveAlbionServer('tenant-1')).rejects.toThrow(
      /albion_server not configured/,
    )
  })

  it('passes guildId through to getAppSetting (tenant isolation)', async () => {
    getAppSettingMock.mockResolvedValueOnce('east')
    await resolveAlbionServer('tenant-XYZ')
    expect(getAppSettingMock).toHaveBeenCalledWith('albion_server', '', 'tenant-XYZ')
  })
})
