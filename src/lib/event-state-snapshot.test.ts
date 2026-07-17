import { describe, expect, it } from 'vitest'
import {
  didEventSnapshotChange,
  parseEventStateSnapshot,
  shouldPollEventSnapshot,
} from './event-state-snapshot'

describe('event state snapshot', () => {
  it('parses only a usable fingerprint contract', () => {
    expect(parseEventStateSnapshot(null)).toBeNull()
    expect(parseEventStateSnapshot({ fingerprint: '' })).toBeNull()
    expect(parseEventStateSnapshot({
      fingerprint: 'abc',
      battle_started_at: '2026-07-18T00:00:00.000Z',
      gather_at: null,
    })).toEqual({
      fingerprint: 'abc',
      battle_started_at: '2026-07-18T00:00:00.000Z',
      gather_at: null,
    })
  })

  it('refreshes without a render baseline and compares established snapshots', () => {
    expect(didEventSnapshotChange(null, 'v1')).toBe(true)
    expect(didEventSnapshotChange('v1', 'v1')).toBe(false)
    expect(didEventSnapshotChange('v1', 'v2')).toBe(true)
  })

  it('stops polling one hour after battle start', () => {
    const startedAt = '2026-07-18T00:00:00.000Z'
    expect(shouldPollEventSnapshot({ fingerprint: 'a', battle_started_at: startedAt, gather_at: null }, Date.parse('2026-07-18T00:59:59.999Z'))).toBe(true)
    expect(shouldPollEventSnapshot({ fingerprint: 'a', battle_started_at: startedAt, gather_at: null }, Date.parse('2026-07-18T01:00:00.000Z'))).toBe(false)
  })
})
