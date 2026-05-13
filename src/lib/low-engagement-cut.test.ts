import { describe, expect, it } from 'vitest'
import {
  isHighEngagement,
  isLowEngagement,
  LOW_ENGAGEMENT_DEATHS_FLOOR,
  LOW_ENGAGEMENT_RATIO,
  type EngagementSignals,
} from './low-engagement-cut'

// 도메인 invariant 화석화: low-engagement 컷 — (K+D < team_size × 10%) AND (D < 3).
// 두 조건 모두 충족해야 hide. 한쪽만 깨져도 의미 있는 전투로 판정.
// SQL/RPC 와 TS 양쪽에 같은 규칙이 있어 경계가 어긋나면 회귀 발생 — 여기서 화석화.

function makeSignals(overrides: Partial<EngagementSignals> = {}): EngagementSignals {
  return {
    homeKills: 0,
    homeDeaths: 0,
    homeTeamSize: 70,
    ...overrides,
  }
}

describe('isLowEngagement — (K+D < team_size × 10%) AND (D < 3)', () => {
  it('returns true when both conditions met (drive-by gank in zerg)', () => {
    // 70명 길드에서 K1/D0: ratio 1<7 ✓, deaths 0<3 ✓ → low
    expect(isLowEngagement(makeSignals({ homeKills: 1, homeDeaths: 0 }))).toBe(true)
  })

  it('returns false when ratio condition fails (busy small fight)', () => {
    // 10명에서 K5/D0: ratio 5<1 ✗ → high engagement (의미 있는 전투)
    expect(isLowEngagement(makeSignals({ homeTeamSize: 10, homeKills: 5, homeDeaths: 0 }))).toBe(
      false,
    )
  })

  it('returns false when deaths floor escapes the cut (positioning wipe)', () => {
    // 70명에서 K0/D3: ratio 3<7 ✓, deaths 3<3 ✗ → high (포지셔닝 실패 진성 패배)
    expect(isLowEngagement(makeSignals({ homeKills: 0, homeDeaths: 3 }))).toBe(false)
  })

  it('returns false when both conditions fail', () => {
    expect(
      isLowEngagement(makeSignals({ homeTeamSize: 10, homeKills: 5, homeDeaths: 5 })),
    ).toBe(false)
  })

  it('uses strict less-than for ratio (K+D exactly at threshold is NOT low)', () => {
    // team_size=70, 10% = 7. K+D == 7 → ratio 7<7 ✗ → high (boundary 정확히 화석화)
    expect(isLowEngagement(makeSignals({ homeKills: 7, homeDeaths: 0 }))).toBe(false)
    expect(isLowEngagement(makeSignals({ homeKills: 4, homeDeaths: 3 }))).toBe(false)
  })

  it('uses strict less-than for deaths floor (D=3 escapes, D=2 does not)', () => {
    // D=3 → high; D=2 with low ratio → low
    expect(isLowEngagement(makeSignals({ homeKills: 0, homeDeaths: 3 }))).toBe(false)
    expect(isLowEngagement(makeSignals({ homeKills: 0, homeDeaths: 2 }))).toBe(true)
  })

  it('exposes ratio and deaths floor constants for SQL/RPC parity', () => {
    // 마이그/RPC 에서 같은 상수를 써야 회귀 안 남. 변경 시 SQL 도 같이 손봐야 함을 화석화.
    expect(LOW_ENGAGEMENT_RATIO).toBe(0.1)
    expect(LOW_ENGAGEMENT_DEATHS_FLOOR).toBe(3)
  })
})

describe('isHighEngagement — isLowEngagement 의 정확한 부정', () => {
  it('returns the inverse of isLowEngagement for every probed signal', () => {
    const cases: EngagementSignals[] = [
      makeSignals({ homeKills: 1, homeDeaths: 0 }), // low
      makeSignals({ homeTeamSize: 10, homeKills: 5, homeDeaths: 0 }), // high
      makeSignals({ homeKills: 0, homeDeaths: 3 }), // high (D escape)
      makeSignals({ homeKills: 7, homeDeaths: 0 }), // high (ratio boundary)
    ]
    for (const c of cases) {
      expect(isHighEngagement(c)).toBe(!isLowEngagement(c))
    }
  })
})
