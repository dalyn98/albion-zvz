import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  categorizeSize,
  computeOutcome,
  fetchRecentBattles,
  type AlbionBattle,
  type SidePerspective,
} from './albion-battles'

// 도메인 invariant 화석화: /battles 판정 규칙 (AGENTS.md #8).
//
// - 10명 미만 갱크는 categorizeSize 가 null → 통계 집계에서 제외.
// - 사이즈 컷 (small/middle/large/zerg) 는 안내 라벨이 아니라 집계 grouping 키.
//   경계 (10/30/31/60/61/100/101) 가 바뀌면 회귀 발생 — 여기서 화석화.
// - computeOutcome 은 killFame 비교 — kill 수가 적어도 fame 이 높은 쪽이 win.

function makeBattle(id: number): AlbionBattle {
  return {
    id,
    startTime: '2026-01-01T00:00:00Z',
    endTime: '2026-01-01T00:30:00Z',
    totalFame: 0,
    totalKills: 0,
    clusterName: null,
    players: {},
    guilds: {},
    alliances: {},
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchRecentBattles — Albion /battles API paging', () => {
  it('keeps list page size at 50 to stay below the Albion API limit', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => makeBattle(i + 1))
    const secondPage = [makeBattle(51)]
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const offset = new URL(String(url)).searchParams.get('offset')
      return Response.json(offset === '0' ? firstPage : secondPage)
    })

    await expect(fetchRecentBattles('east', 2)).resolves.toHaveLength(51)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)))
    expect(urls.map((url) => url.searchParams.get('limit'))).toEqual(['50', '50'])
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual(['0', '50'])
    expect(urls.map((url) => url.searchParams.get('sort'))).toEqual(['recent', 'recent'])
  })
})

describe('categorizeSize — /battles cut-off boundaries', () => {
  it('returns null for fewer than 10 players (gank / straggler — excluded)', () => {
    expect(categorizeSize(0)).toBeNull()
    expect(categorizeSize(9)).toBeNull()
  })

  it('classifies 10–30 as small', () => {
    expect(categorizeSize(10)).toBe('small')
    expect(categorizeSize(20)).toBe('small')
    expect(categorizeSize(30)).toBe('small')
  })

  it('classifies 31–60 as middle', () => {
    expect(categorizeSize(31)).toBe('middle')
    expect(categorizeSize(45)).toBe('middle')
    expect(categorizeSize(60)).toBe('middle')
  })

  it('classifies 61–100 as large', () => {
    expect(categorizeSize(61)).toBe('large')
    expect(categorizeSize(100)).toBe('large')
  })

  it('classifies 101+ as zerg', () => {
    expect(categorizeSize(101)).toBe('zerg')
    expect(categorizeSize(500)).toBe('zerg')
  })
})

function makeSide(overrides: Partial<SidePerspective> = {}): SidePerspective {
  return {
    guildIds: [],
    allianceIds: [],
    teamSize: 0,
    kills: 0,
    deaths: 0,
    killFame: 0,
    guildNames: [],
    allianceNames: [],
    primaryGuildName: '',
    ...overrides,
  }
}

describe('computeOutcome — kill fame 기반 판정', () => {
  it('returns win when home killFame exceeds opponent', () => {
    const home = makeSide({ killFame: 1_000_000 })
    const opponent = makeSide({ killFame: 500_000 })
    expect(computeOutcome(home, opponent)).toBe('win')
  })

  it('returns loss when home killFame is below opponent', () => {
    const home = makeSide({ killFame: 100_000 })
    const opponent = makeSide({ killFame: 800_000 })
    expect(computeOutcome(home, opponent)).toBe('loss')
  })

  it('returns tie when killFame is equal (including both 0)', () => {
    const home = makeSide({ killFame: 500_000 })
    const opponent = makeSide({ killFame: 500_000 })
    expect(computeOutcome(home, opponent)).toBe('tie')
    expect(computeOutcome(makeSide(), makeSide())).toBe('tie')
  })

  it('uses killFame, not kill count — fewer kills can still win', () => {
    // 1킬 빅게임 (high fame) > 5킬 작은 게임 (low fame) → win
    const home = makeSide({ kills: 1, killFame: 2_000_000 })
    const opponent = makeSide({ kills: 5, killFame: 300_000 })
    expect(computeOutcome(home, opponent)).toBe('win')
  })
})
