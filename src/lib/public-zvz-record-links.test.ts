import { describe, expect, it } from 'vitest'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzWeekStart,
} from './public-zvz-record-links'

describe('public ZvZ record links', () => {
  it('keeps the selected weekly snapshot in guild and alliance links', () => {
    expect(
      buildPublicZvzGuildRecordHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        guildAlbionId: 'guild/id',
        weekStart: '2026-07-27',
      }),
    ).toBe('/ko/zvz-battles/guild/east/guild%2Fid?week=2026-07-27')
    expect(
      buildPublicZvzAllianceRecordHref({
        basePath: '/public/zvz-battles/',
        server: 'west',
        allianceAlbionId: 'alliance-id',
        weekStart: '2026-07-27',
      }),
    ).toBe('/public/zvz-battles/alliance/west/alliance-id?week=2026-07-27')
  })

  it('accepts only real Monday UTC week boundaries', () => {
    expect(normalizePublicZvzWeekStart('2026-07-27')).toBe('2026-07-27')
    expect(normalizePublicZvzWeekStart('2026-07-28')).toBeNull()
    expect(normalizePublicZvzWeekStart('2026-02-30')).toBeNull()
    expect(normalizePublicZvzWeekStart(['2026-07-27'])).toBeNull()
  })
})
