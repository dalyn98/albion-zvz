import { describe, expect, it, vi } from 'vitest'
import { executeDueEventStarts, type DueEventStartRow } from './event-auto-start'

const rows: DueEventStartRow[] = [
  {
    id: 'event-1',
    guild_id: 'guild-1',
    gather_at: '2026-08-24T12:30:00.000Z',
  },
  {
    id: 'event-2',
    guild_id: 'guild-2',
    gather_at: '2026-08-24T13:30:00.000Z',
  },
]

describe('event operational auto-start', () => {
  it('continues the batch but reports every per-event failure', async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('event_regear_roster_changed'))

    const result = await executeDueEventStarts({} as never, rows, start)

    expect(start).toHaveBeenNthCalledWith(1, {
      db: {},
      guildId: 'guild-1',
      eventId: 'event-1',
      startedAt: '2026-08-24T12:30:00.000Z',
    })
    expect(result.started).toHaveLength(1)
    expect(result.failures).toEqual([
      {
        event_id: 'event-2',
        guild_id: 'guild-2',
        error: 'event_regear_roster_changed',
      },
    ])
  })
})
