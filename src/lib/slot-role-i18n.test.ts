import { describe, expect, it } from 'vitest'
import { translateSlotRole } from './slot-role-i18n'

describe('translateSlotRole', () => {
  it('maps split DPS internal role keys to message keys', () => {
    const t = (key: string) => `slotRole.${key}`

    expect(translateSlotRole('EngageDps', t)).toBe('slotRole.engageDps')
    expect(translateSlotRole('BrawlerDps', t)).toBe('slotRole.brawlerDps')
  })
})
