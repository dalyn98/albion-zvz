import { describe, expect, it } from 'vitest'
import { buildPublicZvzBoardHref } from './public-zvz-filter-hrefs'

describe('buildPublicZvzBoardHref', () => {
  it('omits default filters from the public URL', () => {
    expect(
      buildPublicZvzBoardHref({
        basePath: '/ko/zvz-battles',
        server: null,
        minPlayers: 21,
        defaultMinPlayers: 21,
      }),
    ).toBe('/ko/zvz-battles')
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
})
