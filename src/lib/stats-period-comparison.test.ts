import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  calculatePeriodChange,
  summarizePointFlowPeriods,
} from './stats-period-comparison'

describe('stats period comparison', () => {
  it('separates the current rolling window from the immediately previous window', () => {
    const summary = summarizePointFlowPeriods(
      [
        { delta: 120, createdAt: '2026-07-20T00:00:00.000Z' },
        { delta: -40, createdAt: '2026-07-10T00:00:00.000Z' },
        { delta: 90, createdAt: '2026-06-20T00:00:00.000Z' },
        { delta: -30, createdAt: '2026-06-15T00:00:00.000Z' },
      ],
      '2026-07-01T00:00:00.000Z',
    )

    expect(summary).toEqual({
      current: { earned: 120, spent: 40, net: 80 },
      previous: { earned: 90, spent: 30, net: 60 },
    })
  })

  it('returns an explicit no-baseline state instead of an infinite percentage', () => {
    expect(calculatePeriodChange(40, 0)).toEqual({ absolute: 40, percent: null })
    expect(calculatePeriodChange(75, 50)).toEqual({ absolute: 25, percent: 50 })
  })

  it('exposes scope, prior-period deltas, and the active-member cohort in the stats UI', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/stats/page.tsx'),
      'utf8',
    )
    const finance = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/stats/_components/FinanceFlowSection.tsx'),
      'utf8',
    )
    const events = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/stats/_components/EventParticipationSection.tsx'),
      'utf8',
    )

    expect(page).toContain("tStats('analysisScopeTitle')")
    expect(finance).toContain('previousTotalEarned')
    expect(finance).toContain('periodComparisonLabel')
    expect(events).toContain('previousParticipationRate')
    expect(events).toContain('eventCohortLabel')
  })
})
