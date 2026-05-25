import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  ),
}))

import { updateAppSetting } from './settings'

interface UpsertCall {
  row: unknown
  options: unknown
}

function createDb() {
  const calls: UpsertCall[] = []
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('app_settings')
      return {
        upsert: vi.fn((row: unknown, options: unknown) => {
          calls.push({ row, options })
          return Promise.resolve({ error: null })
        }),
      }
    }),
  }
  return { db, calls }
}

describe('updateAppSetting', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('saves the event DM lead-time setting with general settings permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('event_dm_lead_minutes', '60')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(calls).toHaveLength(1)
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'event_dm_lead_minutes',
      value: '60',
    })
    expect(calls[0].options).toEqual({ onConflict: 'guild_id,key' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        adminDiscordId: 'admin-1',
        action: 'settings.update',
        details: expect.objectContaining({
          key: 'event_dm_lead_minutes',
          value: '60',
        }),
      }),
    )
  })

  it('rejects event DM lead-time values outside the supported range', async () => {
    await expect(updateAppSetting('event_dm_lead_minutes', '2')).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":5,"max":1440}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('saves the craft regear toggle with settings toggle permission and refreshes craft surfaces', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('craft_regear_enabled', 'true')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_TOGGLES])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'craft_regear_enabled',
      value: 'true',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/craft')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/queue')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/orders')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/my-tasks')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
