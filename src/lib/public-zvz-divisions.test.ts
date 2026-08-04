import { describe, expect, it } from 'vitest'
import {
  buildPublicZvzDivisionRankMap,
  normalizePublicZvzDivisionFilter,
} from './public-zvz-divisions'

describe('public ZvZ divisions', () => {
  it('accepts only canonical division filters', () => {
    expect(normalizePublicZvzDivisionFilter('small')).toBe('small')
    expect(normalizePublicZvzDivisionFilter('mid')).toBe('mid')
    expect(normalizePublicZvzDivisionFilter('large')).toBe('large')
    expect(normalizePublicZvzDivisionFilter('zerg')).toBe('zerg')
    expect(normalizePublicZvzDivisionFilter('middle')).toBeNull()
    expect(normalizePublicZvzDivisionFilter('ALL')).toBeNull()
    expect(normalizePublicZvzDivisionFilter(undefined)).toBeNull()
  })

  it('ranks each server and force-size division independently', () => {
    const ranks = buildPublicZvzDivisionRankMap([
      {
        server: 'east',
        guildAlbionId: 'small-second',
        guildName: 'Second',
        division: 'small',
        score: 80,
        killFame: 100,
      },
      {
        server: 'east',
        guildAlbionId: 'small-first',
        guildName: 'First',
        division: 'small',
        score: 100,
        killFame: 100,
      },
      {
        server: 'east',
        guildAlbionId: 'mid-first',
        guildName: 'Mid',
        division: 'mid',
        score: 60,
        killFame: 100,
      },
      {
        server: 'west',
        guildAlbionId: 'west-first',
        guildName: 'West',
        division: 'small',
        score: 20,
        killFame: 100,
      },
    ])

    expect(ranks.get('east:small:small-first')).toBe(1)
    expect(ranks.get('east:small:small-second')).toBe(2)
    expect(ranks.get('east:mid:mid-first')).toBe(1)
    expect(ranks.get('west:small:west-first')).toBe(1)
  })

  it('keeps dense ties when score, kill fame, and guild name all match', () => {
    const ranks = buildPublicZvzDivisionRankMap([
      {
        server: 'east',
        guildAlbionId: 'same-1',
        guildName: 'Same',
        division: 'large',
        score: 100,
        killFame: 500,
      },
      {
        server: 'east',
        guildAlbionId: 'same-2',
        guildName: 'Same',
        division: 'large',
        score: 100,
        killFame: 500,
      },
      {
        server: 'east',
        guildAlbionId: 'next',
        guildName: 'Next',
        division: 'large',
        score: 90,
        killFame: 500,
      },
    ])

    expect(ranks.get('east:large:same-1')).toBe(1)
    expect(ranks.get('east:large:same-2')).toBe(1)
    expect(ranks.get('east:large:next')).toBe(2)
  })

  it('does not reuse a guild rank after it moves to another division', () => {
    const previous = buildPublicZvzDivisionRankMap([
      {
        server: 'east',
        guildAlbionId: 'moving-guild',
        guildName: 'Moving',
        division: 'mid',
        score: 100,
        killFame: 500,
      },
    ])

    expect(previous.get('east:large:moving-guild')).toBeUndefined()
    expect(previous.get('east:mid:moving-guild')).toBe(1)
  })
})
