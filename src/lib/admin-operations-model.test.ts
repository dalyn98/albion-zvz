import { describe, expect, it } from 'vitest'
import {
  buildOperationsQueueRows,
  summarizeEventReadiness,
} from './admin-operations-model'

describe('admin operations model', () => {
  it('prioritizes overdue work by oldest request and removes empty queues', () => {
    const nowMs = Date.parse('2026-07-15T12:00:00.000Z')

    const rows = buildOperationsQueueRows(
      [
        {
          key: 'regear',
          count: 21,
          oldestCreatedAt: '2026-07-12T04:00:00.000Z',
        },
        {
          key: 'exchange',
          count: 2,
          oldestCreatedAt: '2026-07-12T01:00:00.000Z',
        },
        {
          key: 'shop',
          count: 0,
          oldestCreatedAt: null,
        },
        {
          key: 'eventPayout',
          count: 3,
          oldestCreatedAt: '2026-07-15T02:00:00.000Z',
        },
      ],
      nowMs,
    )

    expect(rows.map((row) => row.key)).toEqual([
      'exchange',
      'regear',
      'eventPayout',
    ])
    expect(rows[0]).toMatchObject({
      count: 2,
      oldestAgeHours: 83,
      urgency: 'overdue',
    })
    expect(rows[2]).toMatchObject({
      oldestAgeHours: 10,
      urgency: 'normal',
    })
  })

  it('uses count as a stable fallback when queue age is missing or invalid', () => {
    const rows = buildOperationsQueueRows(
      [
        { key: 'craft', count: 1, oldestCreatedAt: 'not-a-date' },
        { key: 'memberTrade', count: 4, oldestCreatedAt: null },
        {
          key: 'donation',
          count: 2,
          oldestCreatedAt: '2026-07-15T13:00:00.000Z',
        },
      ],
      Date.parse('2026-07-15T12:00:00.000Z'),
    )

    expect(rows.map((row) => row.key)).toEqual([
      'memberTrade',
      'donation',
      'craft',
    ])
    expect(rows.every((row) => row.oldestAgeHours === null)).toBe(true)
  })

  it('summarizes event readiness without overstating malformed slot counts', () => {
    expect(
      summarizeEventReadiness({
        totalSlots: 30,
        assignedSlots: 22,
      }),
    ).toEqual({
      totalSlots: 30,
      assignedSlots: 22,
      openSlots: 8,
      fillPercent: 73,
      status: 'needsMembers',
    })

    expect(
      summarizeEventReadiness({
        totalSlots: 7,
        assignedSlots: 8,
      }),
    ).toEqual({
      totalSlots: 7,
      assignedSlots: 7,
      openSlots: 0,
      fillPercent: 100,
      status: 'full',
    })

    expect(
      summarizeEventReadiness({
        totalSlots: 0,
        assignedSlots: 0,
      }),
    ).toEqual({
      totalSlots: 0,
      assignedSlots: 0,
      openSlots: 0,
      fillPercent: 0,
      status: 'unconfigured',
    })
  })
})
