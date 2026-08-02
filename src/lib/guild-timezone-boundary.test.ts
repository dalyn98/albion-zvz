import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatGatherTime } from '@/lib/craft-grouping'
import { getCurrentWeekStartIso } from '@/lib/timezone'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('guild timezone boundary', () => {
  it('computes Monday in the guild timezone instead of the process timezone', () => {
    const now = new Date('2026-06-07T16:00:00.000Z')

    expect(getCurrentWeekStartIso(now, 'Asia/Seoul')).toBe(
      '2026-06-07T15:00:00.000Z',
    )
    expect(getCurrentWeekStartIso(now, 'America/Los_Angeles')).toBe(
      '2026-06-01T07:00:00.000Z',
    )
  })

  it('formats the same gather instant in the selected guild timezone', () => {
    const instant = '2026-06-01T12:30:00.000Z'
    expect(formatGatherTime(instant, 'Asia/Seoul')).toBe('06/01 21:30')
    expect(formatGatherTime(instant, 'America/New_York')).toBe('06/01 08:30')
  })

  it('threads the guild timezone through craft statistics and queue surfaces', () => {
    const stats = read('src/app/actions/craft-stats-admin.ts')
    expect(stats).toContain('getTenantTimezone(guildId)')
    expect(stats).toContain('getCurrentWeekStartIso(new Date(), tenantTimezone)')

    for (const path of [
      'src/app/(app-shell)/craft/queue/page.tsx',
      'src/app/(app-shell)/craft/my-tasks/page.tsx',
      'src/app/(app-shell)/admin/dashboard/craft/page.tsx',
    ]) {
      const source = read(path)
      expect(source, path).toContain('getTenantTimezone(guildId)')
      expect(source, path).toContain('timezone={timezone}')
    }
  })
})
