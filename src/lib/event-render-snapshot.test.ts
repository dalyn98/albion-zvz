import { describe, expect, it } from 'vitest'
import {
  eventRenderSnapshotCacheKey,
  isEventRenderSnapshotCacheDisabled,
} from './event-render-snapshot'

describe('event render snapshot cache identity', () => {
  it('partitions cached snapshots by tenant, event, and monotonic revision', () => {
    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    })).toEqual(['event-render-snapshot', 'guild-a', 'event-a', '41'])

    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-b',
      eventId: 'event-a',
      stateRevision: '41',
    })).not.toEqual(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    }))

    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '42',
    })).not.toEqual(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    }))
  })

  it('only enables the emergency bypass for an explicit true value', () => {
    expect(isEventRenderSnapshotCacheDisabled(undefined)).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('false')).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('1')).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('true')).toBe(true)
  })
})
