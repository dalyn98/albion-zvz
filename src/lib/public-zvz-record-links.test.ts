import { describe, expect, it } from 'vitest'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzAlbionId,
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
  normalizePublicZvzUtcDateTimeLocal,
  normalizePublicZvzWeekStart,
} from './public-zvz-record-links'

describe('public ZvZ record links', () => {
  it('accepts Albion URL-safe base64 ids, including underscores', () => {
    expect(normalizePublicZvzAlbionId('BLdM7i7FS7ulcbzDJfvu_A')).toBe(
      'BLdM7i7FS7ulcbzDJfvu_A',
    )
    expect(normalizePublicZvzAlbionId(' yK6D__BWRPeTAUGSSXBQQA ')).toBe(
      'yK6D__BWRPeTAUGSSXBQQA',
    )
    expect(normalizePublicZvzAlbionId('guild/id')).toBeNull()
  })

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

  it('normalizes season snapshot query values', () => {
    expect(normalizePublicZvzDate('2026-08-02')).toBe('2026-08-02')
    expect(normalizePublicZvzDate('2026-02-30')).toBeNull()
    expect(
      normalizePublicZvzSeasonId('550E8400-E29B-41D4-A716-446655440000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(normalizePublicZvzSeasonId('season-1')).toBeNull()
  })

  it('normalizes exact UTC season boundaries from datetime-local inputs', () => {
    expect(normalizePublicZvzUtcDateTimeLocal('2026-07-04T11:00')).toBe(
      '2026-07-04T11:00:00.000Z',
    )
    expect(normalizePublicZvzUtcDateTimeLocal('2026-02-30T11:00')).toBeNull()
    expect(normalizePublicZvzUtcDateTimeLocal('2026-07-04')).toBeNull()
  })

  it('prefers a season snapshot over the legacy weekly query', () => {
    expect(
      buildPublicZvzGuildRecordHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        guildAlbionId: 'guild-id',
        weekStart: '2026-07-27',
        seasonId: '550e8400-e29b-41d4-a716-446655440000',
        asOfDate: '2026-08-02',
      }),
    ).toBe(
      '/ko/zvz-battles/guild/east/guild-id?season=550e8400-e29b-41d4-a716-446655440000&asOf=2026-08-02',
    )
  })

  it('keeps the selected size ranking scope only in alliance season links', () => {
    expect(
      buildPublicZvzAllianceRecordHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        allianceAlbionId: 'alliance-id',
        seasonId: '550e8400-e29b-41d4-a716-446655440000',
        asOfDate: '2026-08-02',
        scale: 'large',
      }),
    ).toBe(
      '/ko/zvz-battles/alliance/east/alliance-id?season=550e8400-e29b-41d4-a716-446655440000&asOf=2026-08-02&scale=large',
    )
  })
})
