import { describe, expect, it } from 'vitest'
import {
  TACTICS_EXPERIMENTAL_SETTING_KEY,
  isTacticsExperimentalSettingEnabled,
} from './feature'

describe('tactics experimental feature setting', () => {
  it('is fail-closed unless the tenant explicitly stores true', () => {
    expect(TACTICS_EXPERIMENTAL_SETTING_KEY).toBe(
      'tactics_experimental_enabled',
    )
    expect(isTacticsExperimentalSettingEnabled('true')).toBe(true)
    expect(isTacticsExperimentalSettingEnabled('false')).toBe(false)
    expect(isTacticsExperimentalSettingEnabled('TRUE')).toBe(false)
    expect(isTacticsExperimentalSettingEnabled('')).toBe(false)
    expect(isTacticsExperimentalSettingEnabled(undefined)).toBe(false)
  })
})
