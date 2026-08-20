import { describe, expect, it } from 'vitest'
import {
  didEventSnapshotChange,
  eventStateFingerprint,
  parseEventStateSnapshot,
  resolveEventSnapshotPollAction,
  resolveEventSnapshotPollDelayMs,
  shouldPollEventSnapshot,
} from './event-state-snapshot'

describe('event state snapshot', () => {
  it('normalizes bigint revisions into stable non-empty fingerprints', () => {
    expect(eventStateFingerprint(0)).toBe('0')
    expect(eventStateFingerprint('42')).toBe('42')
    expect(eventStateFingerprint(null)).toBeNull()
  })
  it('parses only a usable fingerprint contract', () => {
    expect(parseEventStateSnapshot(null)).toBeNull()
    expect(parseEventStateSnapshot({ fingerprint: '' })).toBeNull()
    expect(parseEventStateSnapshot({
      fingerprint: 'abc',
      battle_started_at: '2026-07-18T00:00:00.000Z',
      gather_at: null,
      status: 'published',
    })).toEqual({
      fingerprint: 'abc',
      battle_started_at: '2026-07-18T00:00:00.000Z',
      gather_at: null,
      status: 'published',
    })
  })

  it('refreshes without a render baseline and compares established snapshots', () => {
    expect(didEventSnapshotChange(null, 'v1')).toBe(true)
    expect(didEventSnapshotChange('v1', 'v1')).toBe(false)
    expect(didEventSnapshotChange('v1', 'v2')).toBe(true)
  })

  it('stops polling one hour after battle start', () => {
    const startedAt = '2026-07-18T00:00:00.000Z'
    expect(shouldPollEventSnapshot({ fingerprint: 'a', battle_started_at: startedAt, gather_at: null, status: 'published' }, Date.parse('2026-07-18T00:59:59.999Z'))).toBe(true)
    expect(shouldPollEventSnapshot({ fingerprint: 'a', battle_started_at: startedAt, gather_at: null, status: 'published' }, Date.parse('2026-07-18T01:00:00.000Z'))).toBe(false)
    expect(shouldPollEventSnapshot({ fingerprint: 'a', battle_started_at: startedAt, gather_at: null, status: 'cancelled' }, Date.parse('2026-07-18T00:30:00.000Z'))).toBe(false)
  })

  it('refreshes a removed or unpublished event into its not-found state', () => {
    expect(resolveEventSnapshotPollAction({
      responseStatus: 404,
      confirmedFingerprint: 'v1',
    })).toBe('refresh')
  })

  it('keeps retrying a changed fingerprint until a render confirms it', () => {
    const input = {
      responseStatus: 200,
      confirmedFingerprint: 'v1',
      nextFingerprint: 'v2',
      shouldPoll: true,
    } as const

    expect(resolveEventSnapshotPollAction(input)).toBe('refresh')
    expect(resolveEventSnapshotPollAction(input)).toBe('refresh')
  })

  it('stops only after a terminal snapshot matches the rendered baseline', () => {
    expect(resolveEventSnapshotPollAction({
      responseStatus: 200,
      confirmedFingerprint: 'v2',
      nextFingerprint: 'v2',
      shouldPoll: false,
    })).toBe('stop')
    expect(resolveEventSnapshotPollAction({
      responseStatus: 503,
      confirmedFingerprint: 'v2',
    })).toBe('continue')
  })

  it('honors Retry-After without polling faster than the normal interval', () => {
    expect(resolveEventSnapshotPollDelayMs({
      responseStatus: 429,
      retryAfter: '90',
      intervalMs: 45_000,
    })).toBe(90_000)
    expect(resolveEventSnapshotPollDelayMs({
      responseStatus: 429,
      retryAfter: '10',
      intervalMs: 45_000,
    })).toBe(45_000)
    expect(resolveEventSnapshotPollDelayMs({
      responseStatus: 503,
      retryAfter: '90',
      intervalMs: 45_000,
    })).toBe(45_000)
  })
})
