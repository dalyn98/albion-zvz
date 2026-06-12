import { describe, expect, it } from 'vitest'
import { eventSlotCode, parseEventSlotCode } from './event-slot-codes'

describe('event slot codes', () => {
  it('formats party letter codes for normal event parties', () => {
    expect(eventSlotCode({ partyNumber: 1, slotNumber: 1 })).toBe('A01')
    expect(eventSlotCode({ partyNumber: 2, slotNumber: 17 })).toBe('B17')
  })

  it('parses compact and dashed slot codes', () => {
    expect(parseEventSlotCode('a1')).toEqual({ partyNumber: 1, slotNumber: 1 })
    expect(parseEventSlotCode('B-17')).toEqual({ partyNumber: 2, slotNumber: 17 })
    expect(parseEventSlotCode('2-17')).toEqual({ partyNumber: 2, slotNumber: 17 })
    expect(parseEventSlotCode('P2-17')).toEqual({ partyNumber: 2, slotNumber: 17 })
  })

  it('rejects malformed codes', () => {
    expect(parseEventSlotCode('')).toBeNull()
    expect(parseEventSlotCode('AA01')).toBeNull()
    expect(parseEventSlotCode('A00')).toBeNull()
    expect(parseEventSlotCode('P0-1')).toBeNull()
  })
})
