import { describe, expect, it } from 'vitest'
import {
  calcOutcomeStats,
  calcParticipationStreak,
  calcRanking,
  calcSurvivalFromBattles,
  type BattleParticipationOutcome,
} from './member-stats'

// 도메인 invariant 화석화: 멤버 프로필 통계 규칙.
// - 생존률: deathless 비율. 한 배틀에 여러 죽음 있어도 "데스 있음" 으로 1회 카운트.
// - 일자 스트릭: 같은 날 여러 이벤트는 하루로 합산. 어제까지 연속이면 current 살아있음.
// - outcome 승률: tie/null/excluded 는 분모에서 제외 (승률 깎지 않음).
// - 랭킹: count 0 인 멤버는 분모에서 제외 — "상위 12%" 의 의미를 지키기 위함.

describe('calcSurvivalFromBattles — 배틀 단위 생존률 + 무데스 스트릭', () => {
  it('returns null rate and zero streaks for empty input', () => {
    const r = calcSurvivalFromBattles([])
    expect(r.survivalRate).toBeNull()
    expect(r.evaluatedEvents).toBe(0)
    expect(r.currentDeathlessStreak).toBe(0)
    expect(r.longestDeathlessStreak).toBe(0)
  })

  it('returns 100% survival when no deaths', () => {
    const battles: BattleParticipationOutcome[] = [
      { startedAt: '2026-01-01T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-02T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-03T10:00:00Z', hadDeath: false },
    ]
    const r = calcSurvivalFromBattles(battles)
    expect(r.survivalRate).toBe(1)
    expect(r.evaluatedEvents).toBe(3)
    expect(r.currentDeathlessStreak).toBe(3)
    expect(r.longestDeathlessStreak).toBe(3)
  })

  it('returns 0% survival and breaks streaks when every battle has a death', () => {
    const battles: BattleParticipationOutcome[] = [
      { startedAt: '2026-01-01T10:00:00Z', hadDeath: true },
      { startedAt: '2026-01-02T10:00:00Z', hadDeath: true },
    ]
    const r = calcSurvivalFromBattles(battles)
    expect(r.survivalRate).toBe(0)
    expect(r.currentDeathlessStreak).toBe(0)
    expect(r.longestDeathlessStreak).toBe(0)
  })

  it('resets current streak after the latest death; preserves longest', () => {
    // 첫 3개 무데스 → longest=3, 죽음, 그 후 1개 무데스 → current=1.
    const battles: BattleParticipationOutcome[] = [
      { startedAt: '2026-01-01T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-02T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-03T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-04T10:00:00Z', hadDeath: true },
      { startedAt: '2026-01-05T10:00:00Z', hadDeath: false },
    ]
    const r = calcSurvivalFromBattles(battles)
    expect(r.survivalRate).toBe(4 / 5)
    expect(r.currentDeathlessStreak).toBe(1)
    expect(r.longestDeathlessStreak).toBe(3)
  })

  it('sorts by startedAt before computing (order-independent input)', () => {
    // 입력을 시간 역순으로 주어도 결과는 동일해야 한다.
    const battles: BattleParticipationOutcome[] = [
      { startedAt: '2026-01-05T10:00:00Z', hadDeath: false },
      { startedAt: '2026-01-04T10:00:00Z', hadDeath: true },
      { startedAt: '2026-01-01T10:00:00Z', hadDeath: false },
    ]
    const r = calcSurvivalFromBattles(battles)
    expect(r.currentDeathlessStreak).toBe(1)
    expect(r.longestDeathlessStreak).toBe(1)
  })
})

describe('calcParticipationStreak — 일자 단위 연속 참여', () => {
  // 모든 nowMs 는 KST 기준 (Asia/Seoul). 2026-01-10 12:00 KST = 2026-01-10T03:00:00Z
  const KST_2026_01_10_NOON_MS = Date.parse('2026-01-10T03:00:00Z')

  it('returns 0/0 for empty input', () => {
    const r = calcParticipationStreak([], KST_2026_01_10_NOON_MS)
    expect(r).toEqual({ currentStreak: 0, longestStreak: 0 })
  })

  it('collapses multiple events on the same day into one streak day', () => {
    const events = [
      '2026-01-10T01:00:00Z', // KST 10:00 = 1/10
      '2026-01-10T05:00:00Z', // KST 14:00 = 1/10 (같은 날)
    ]
    const r = calcParticipationStreak(events, KST_2026_01_10_NOON_MS)
    expect(r.currentStreak).toBe(1)
    expect(r.longestStreak).toBe(1)
  })

  it('counts consecutive days as a continuous streak', () => {
    // KST 기준 1/8, 1/9, 1/10 — 모두 연속 → streak=3
    const events = [
      '2026-01-07T20:00:00Z', // KST 1/8 05:00
      '2026-01-09T01:00:00Z', // KST 1/9 10:00
      '2026-01-09T20:00:00Z', // KST 1/10 05:00
    ]
    const r = calcParticipationStreak(events, KST_2026_01_10_NOON_MS)
    expect(r.currentStreak).toBe(3)
    expect(r.longestStreak).toBe(3)
  })

  it('breaks streak on gap; longest preserved', () => {
    // KST 1/1, 1/2 (연속 2), 갭, 1/9, 1/10 (연속 2)
    const events = [
      '2026-01-01T05:00:00Z',
      '2026-01-02T05:00:00Z',
      '2026-01-09T05:00:00Z',
      '2026-01-10T05:00:00Z',
    ]
    const r = calcParticipationStreak(events, KST_2026_01_10_NOON_MS)
    expect(r.currentStreak).toBe(2)
    expect(r.longestStreak).toBe(2)
  })

  it('keeps current alive when last event is yesterday (gap === 1)', () => {
    // KST 1/9 만 참여, 오늘은 1/10 → 갭 1일 → current 유지.
    const events = ['2026-01-09T05:00:00Z']
    const r = calcParticipationStreak(events, KST_2026_01_10_NOON_MS)
    expect(r.currentStreak).toBe(1)
    expect(r.longestStreak).toBe(1)
  })

  it('resets current to 0 when last event is 2+ days ago', () => {
    // KST 1/7, 오늘 1/10 → 갭 3일 → current=0, longest 보존.
    const events = ['2026-01-07T05:00:00Z']
    const r = calcParticipationStreak(events, KST_2026_01_10_NOON_MS)
    expect(r.currentStreak).toBe(0)
    expect(r.longestStreak).toBe(1)
  })
})

describe('calcOutcomeStats — win/loss 만 분모 (tie/null/excluded 제외)', () => {
  it('returns null rate for empty input', () => {
    const r = calcOutcomeStats([])
    expect(r).toEqual({ wins: 0, losses: 0, evaluatedEvents: 0, winRate: null })
  })

  it('counts only win/loss; ties and nulls excluded from denominator', () => {
    const r = calcOutcomeStats(['win', 'win', 'loss', 'tie', null, 'excluded'])
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(1)
    expect(r.evaluatedEvents).toBe(3) // tie/null/excluded 빠짐
    expect(r.winRate).toBeCloseTo(2 / 3)
  })

  it('returns null winRate when all outcomes are tie/null (no win+loss to divide)', () => {
    const r = calcOutcomeStats(['tie', null, 'excluded'])
    expect(r.winRate).toBeNull()
    expect(r.evaluatedEvents).toBe(0)
  })

  it('returns 100% / 0% on pure all-win / all-loss', () => {
    expect(calcOutcomeStats(['win', 'win']).winRate).toBe(1)
    expect(calcOutcomeStats(['loss', 'loss', 'loss']).winRate).toBe(0)
  })
})

describe('calcRanking — count > 0 인 멤버만 분모', () => {
  it('returns null rank when myCount is 0', () => {
    const r = calcRanking(0, [10, 5, 3])
    expect(r.rank).toBeNull()
    expect(r.percentile).toBeNull()
    expect(r.totalRanked).toBe(3)
  })

  it('returns null rank when everyone has 0', () => {
    expect(calcRanking(0, [0, 0, 0])).toEqual({ rank: null, totalRanked: 0, percentile: null })
  })

  it('returns rank 1 when no one is higher', () => {
    const r = calcRanking(100, [100, 50, 30, 0])
    expect(r.rank).toBe(1) // higher=0, rank=1
    expect(r.totalRanked).toBe(3) // 0 인 멤버 제외
  })

  it('counts only strictly higher members (ties keep rank above)', () => {
    // 본인 50, 다른 멤버 [100, 50, 50, 30, 0] → higher=1, rank=2
    const r = calcRanking(50, [100, 50, 50, 30, 0])
    expect(r.rank).toBe(2)
    expect(r.totalRanked).toBe(4)
  })

  it('clamps percentile to [1, 100] and rounds', () => {
    // allCounts 는 본인 포함 분포. 본인=1, 다른 5명=100~60 → higher=5, rank=6,
    // totalRanked=6. percentile = round(6/6 * 100) = 100 (cap 검증).
    const r = calcRanking(1, [1, 100, 90, 80, 70, 60])
    expect(r.rank).toBe(6)
    expect(r.totalRanked).toBe(6)
    expect(r.percentile).toBe(100)
    expect(r.percentile! >= 1 && r.percentile! <= 100).toBe(true)
  })
})
