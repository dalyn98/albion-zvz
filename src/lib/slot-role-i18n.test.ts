import { describe, expect, it } from 'vitest'
import { translateSlotRole } from './slot-role-i18n'

describe('translateSlotRole', () => {
  it('returns canonical English role labels without translating by locale', () => {
    const t = (key: string) => `translated.${key}`

    expect(translateSlotRole('Caller', t)).toBe('Caller')
    expect(translateSlotRole('OffTanker', t)).toBe('Offense Tanker')
    expect(translateSlotRole('DefTanker', t)).toBe('Defense Tanker')
    expect(translateSlotRole('Sup', t)).toBe('Support')
    expect(translateSlotRole('Healer', t)).toBe('Healer')
    expect(translateSlotRole('Dps', t)).toBe('Engage DPS')
    expect(translateSlotRole('EngageDps', t)).toBe('Engage DPS')
    expect(translateSlotRole('BrawlerDps', t)).toBe('Engage DPS')
    expect(translateSlotRole('BM', t)).toBe('Battle Mount')
    expect(translateSlotRole('기타', t)).toBe('Other')
  })
})
