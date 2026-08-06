import { describe, expect, it } from 'vitest'
import {
  buildPublicZvzBoardHref,
  normalizePublicZvzRankingPage,
} from './public-zvz-filter-hrefs'

describe('buildPublicZvzBoardHref', () => {
  it('omits default filters and the default alliance selection from the public URL', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: null,
        minPlayers: 21,
        defaultMinPlayers: 21,
        entityKind: 'alliance',
      }),
    ).toBe('/ko/zvz-battles')
  })

  it('serializes guild selection because alliance is the board default', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: null,
        minPlayers: 21,
        defaultMinPlayers: 21,
        entityKind: 'guild',
      }),
    ).toBe('/ko/zvz-battles?entity=guild')
  })

  it('preserves server season date and a custom recent-force threshold', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: 'west',
        division: 'large',
        minPlayers: 35,
        defaultMinPlayers: 21,
        seasonId: 'season-1',
        asOfDate: '2026-08-03',
      }),
    ).toBe('/ko/zvz-battles?server=west&division=large&min=35&season=season-1&asOf=2026-08-03')
  })

  it('drops a server-specific season when switching to all servers', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: null,
        minPlayers: 18,
        defaultMinPlayers: 21,
        seasonId: 'west-season',
        asOfDate: '2026-08-03',
      }),
    ).toBe('/ko/zvz-battles?min=18&asOf=2026-08-03')
  })

  it('keeps a size-specific ranking filter while omitting the all-size default', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        division: 'zerg',
        minPlayers: 21,
        defaultMinPlayers: 21,
      }),
    ).toBe('/ko/zvz-battles?server=east&division=zerg')
  })

  it('preserves a normalized guild or alliance search across board filters', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        minPlayers: 21,
        defaultMinPlayers: 21,
        query: '  V A G A B O N D  ',
      }),
    ).toBe('/ko/zvz-battles?server=east&q=V+A+G+A+B+O+N+D')
  })

  it('drops invalid one-character searches from shareable URLs', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: null,
        minPlayers: 21,
        defaultMinPlayers: 21,
        query: 'V',
      }),
    ).toBe('/ko/zvz-battles')
  })

  it('serializes ranking pages after the first page and caps them at the top 100', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        minPlayers: 21,
        defaultMinPlayers: 21,
        rankingPage: 4,
      }),
    ).toBe('/ko/zvz-battles?server=east&rankPage=4')

    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: 'east',
        minPlayers: 21,
        defaultMinPlayers: 21,
        rankingPage: 99,
      }),
    ).toBe('/ko/zvz-battles?server=east&rankPage=5')
  })

  it('normalizes invalid ranking pages to the first page', () => {
    expect(normalizePublicZvzRankingPage(undefined)).toBe(1)
    expect(normalizePublicZvzRankingPage('invalid')).toBe(1)
    expect(normalizePublicZvzRankingPage('-2')).toBe(1)
    expect(normalizePublicZvzRankingPage('3')).toBe(3)
  })
})
