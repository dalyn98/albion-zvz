import { describe, expect, it } from 'vitest'
import { CAP, serializeCapabilities } from './permissions'
import {
  getAvailableSettingsTabs,
  getSettingsAccessFlags,
} from './settings-access'

describe('settings access', () => {
  it('limits a siphon officer to the guild tab and siphon operating start form', () => {
    const access = getSettingsAccessFlags(false, serializeCapabilities(CAP.SIPHON_MANAGE))

    expect(getAvailableSettingsTabs(access)).toEqual(['guild'])
    expect(access.siphonLogStart).toBe(true)
    expect(access.shopChestLogStart).toBe(false)
    expect(access.general).toBe(false)
    expect(access.toggles).toBe(false)
  })

  it('keeps chest-log officers scoped to log operating start settings', () => {
    const access = getSettingsAccessFlags(false, serializeCapabilities(CAP.CHEST_LOG_PASTE))

    expect(getAvailableSettingsTabs(access)).toEqual(['guild'])
    expect(access.shopChestLogStart).toBe(true)
    expect(access.siphonLogStart).toBe(false)
  })

  it('shows settings tabs only for capabilities that can save something there', () => {
    expect(
      getAvailableSettingsTabs(
        getSettingsAccessFlags(false, serializeCapabilities(CAP.SETTINGS_GENERAL)),
      ),
    ).toEqual(['guild', 'events', 'regear'])

    expect(
      getAvailableSettingsTabs(
        getSettingsAccessFlags(false, serializeCapabilities(CAP.SETTINGS_TOGGLES)),
      ),
    ).toEqual(['guild', 'events', 'regear'])

    expect(
      getAvailableSettingsTabs(
        getSettingsAccessFlags(false, serializeCapabilities(CAP.SETTINGS_GUILD_PROFILE)),
      ),
    ).toEqual(['landing'])

    expect(
      getAvailableSettingsTabs(
        getSettingsAccessFlags(false, serializeCapabilities(CAP.SETTINGS_PERMISSIONS)),
      ),
    ).toEqual(['permissions', 'notifications'])
  })

  it('gives legacy admins every settings surface including role rewards', () => {
    const access = getSettingsAccessFlags(true, '0')

    expect(getAvailableSettingsTabs(access)).toEqual([
      'guild',
      'permissions',
      'notifications',
      'events',
      'regear',
      'landing',
    ])
    expect(Object.values(access).every(Boolean)).toBe(true)
  })

  it('shows deletion authority only on the guild settings surface', () => {
    const access = getSettingsAccessFlags(
      false,
      serializeCapabilities(CAP.WORKSPACE_DELETE),
    )

    expect(getAvailableSettingsTabs(access)).toEqual(['guild'])
    expect(access.workspaceLifecycle).toBe(true)
    expect(access.general).toBe(false)
    expect(access.permissions).toBe(false)
  })
})
