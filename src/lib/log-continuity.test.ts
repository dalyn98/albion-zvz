import { describe, expect, it } from 'vitest'
import { summarizeLogContinuity } from './log-continuity'

interface Entry {
  loggedAt: Date
  key: string
  label: string
}

const entry = (iso: string, key: string, label = key): Entry => ({
  loggedAt: new Date(iso),
  key,
  label,
})

const options = {
  getLoggedAt: (e: Entry) => e.loggedAt,
  getKey: (e: Entry) => e.key,
  getLabel: (e: Entry) => e.label,
}

describe('summarizeLogContinuity', () => {
  it('treats all new entries as the start when there is no stored latest row', () => {
    const result = summarizeLogContinuity({
      allEntries: [
        entry('2026-05-24T01:00:00Z', 'a'),
        entry('2026-05-24T01:05:00Z', 'b'),
      ],
      newEntries: [
        entry('2026-05-24T01:00:00Z', 'a'),
        entry('2026-05-24T01:05:00Z', 'b'),
      ],
      latestStoredEntries: [],
      ...options,
    })

    expect(result).toEqual({
      lastKnownLoggedAt: null,
      lastKnownLabel: null,
      lastKnownInBatch: false,
      newEntriesAfterLast: 2,
      gapFromLastKnownMs: null,
    })
  })

  it('marks the batch continuous when it includes the latest stored row', () => {
    const latest = entry('2026-05-24T01:00:00Z', 'latest', 'Latest +1')
    const result = summarizeLogContinuity({
      allEntries: [
        latest,
        entry('2026-05-24T01:05:00Z', 'new-a'),
      ],
      newEntries: [entry('2026-05-24T01:05:00Z', 'new-a')],
      latestStoredEntries: [latest],
      ...options,
    })

    expect(result.lastKnownLoggedAt).toBe('2026-05-24T01:00:00.000Z')
    expect(result.lastKnownLabel).toBe('Latest +1')
    expect(result.lastKnownInBatch).toBe(true)
    expect(result.newEntriesAfterLast).toBe(1)
    expect(result.gapFromLastKnownMs).toBeNull()
  })

  it('computes a gap when new rows start after the latest stored row without overlap', () => {
    const latest = entry('2026-05-24T01:00:00Z', 'latest')
    const result = summarizeLogContinuity({
      allEntries: [entry('2026-05-24T03:30:00Z', 'new-a')],
      newEntries: [entry('2026-05-24T03:30:00Z', 'new-a')],
      latestStoredEntries: [latest],
      ...options,
    })

    expect(result.lastKnownInBatch).toBe(false)
    expect(result.newEntriesAfterLast).toBe(1)
    expect(result.gapFromLastKnownMs).toBe(9_000_000)
  })

  it('does not report new rows when a pasted batch is older than the stored tail', () => {
    const latest = entry('2026-05-24T03:00:00Z', 'latest')
    const result = summarizeLogContinuity({
      allEntries: [entry('2026-05-24T01:00:00Z', 'old-a')],
      newEntries: [entry('2026-05-24T01:00:00Z', 'old-a')],
      latestStoredEntries: [latest],
      ...options,
    })

    expect(result.lastKnownInBatch).toBe(false)
    expect(result.newEntriesAfterLast).toBe(0)
    expect(result.gapFromLastKnownMs).toBeNull()
  })

  it('treats any row at the latest stored timestamp as a valid overlap', () => {
    const latestA = entry('2026-05-24T03:00:00Z', 'latest-a')
    const latestB = entry('2026-05-24T03:00:00Z', 'latest-b', 'Latest B +1')
    const result = summarizeLogContinuity({
      allEntries: [
        latestB,
        entry('2026-05-24T03:05:00Z', 'new-a'),
      ],
      newEntries: [entry('2026-05-24T03:05:00Z', 'new-a')],
      latestStoredEntries: [latestA, latestB],
      ...options,
    })

    expect(result.lastKnownLoggedAt).toBe('2026-05-24T03:00:00.000Z')
    expect(result.lastKnownLabel).toBe('latest-a')
    expect(result.lastKnownInBatch).toBe(true)
    expect(result.newEntriesAfterLast).toBe(1)
    expect(result.gapFromLastKnownMs).toBeNull()
  })
})
