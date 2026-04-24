// 업적/뱃지 시스템 — 참여·킬·무사망·생존률·연속참여 임계값 기반.
// DB 테이블 없이 집계 통계(MemberAdvancedStats, MyDashboardData) 로부터 순수 함수로
// 계산하므로 마이그레이션 불필요. "획득일" 이력이 필요해지면 그때 member_badges
// 테이블을 추가한다 (YAGNI).
//
// 임계값 선정 기준:
// - participation: 10/50/100/300 — ZvZ 참여 빈도 실제 분포에 맞춘 bronze~diamond
// - kill: 10/50/200/1000 — 길드원 전반이 도달 가능한 커브
// - deathless: 5/15/30 — longest streak (한 번이라도 달성) 기준
// - survival: 80/90/95% — 최소 10 이벤트 이상 평가된 경우에만 평가
// - streak: 7/30 — longest participation streak (일) 기준

export type BadgeCategory =
  | 'participation'
  | 'kill'
  | 'deathless'
  | 'survival'
  | 'streak'
  | 'win'

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface BadgeDefinition {
  id: string
  category: BadgeCategory
  tier: BadgeTier
  threshold: number
}

export interface BadgeInput {
  participationCount: number
  kills: number
  deathlessLongestStreak: number
  survivalRate: number | null
  evaluatedEvents: number
  participationLongestStreak: number
  // outcome='win' 으로 확정된 참여 이벤트 누적 수.
  wins: number
}

export interface BadgeStatus {
  definition: BadgeDefinition
  unlocked: boolean
  // 0 ~ 1 진행률. unlocked 면 1.
  progress: number
  currentValue: number
}

// 생존률 뱃지는 표본 크기가 작으면 우연에 의해 과대평가되므로 최소 평가 이벤트
// 수를 요구한다.
const SURVIVAL_MIN_EVALUATED = 10

export const BADGE_DEFINITIONS: ReadonlyArray<BadgeDefinition> = [
  { id: 'participation_10', category: 'participation', tier: 'bronze', threshold: 10 },
  { id: 'participation_50', category: 'participation', tier: 'silver', threshold: 50 },
  { id: 'participation_100', category: 'participation', tier: 'gold', threshold: 100 },
  { id: 'participation_300', category: 'participation', tier: 'diamond', threshold: 300 },

  { id: 'kill_10', category: 'kill', tier: 'bronze', threshold: 10 },
  { id: 'kill_50', category: 'kill', tier: 'silver', threshold: 50 },
  { id: 'kill_200', category: 'kill', tier: 'gold', threshold: 200 },
  { id: 'kill_1000', category: 'kill', tier: 'diamond', threshold: 1000 },

  { id: 'deathless_5', category: 'deathless', tier: 'bronze', threshold: 5 },
  { id: 'deathless_15', category: 'deathless', tier: 'silver', threshold: 15 },
  { id: 'deathless_30', category: 'deathless', tier: 'gold', threshold: 30 },

  { id: 'survival_80', category: 'survival', tier: 'silver', threshold: 80 },
  { id: 'survival_90', category: 'survival', tier: 'gold', threshold: 90 },
  { id: 'survival_95', category: 'survival', tier: 'diamond', threshold: 95 },

  { id: 'streak_7', category: 'streak', tier: 'bronze', threshold: 7 },
  { id: 'streak_30', category: 'streak', tier: 'gold', threshold: 30 },

  { id: 'win_10', category: 'win', tier: 'bronze', threshold: 10 },
  { id: 'win_50', category: 'win', tier: 'silver', threshold: 50 },
  { id: 'win_200', category: 'win', tier: 'gold', threshold: 200 },
  { id: 'win_500', category: 'win', tier: 'diamond', threshold: 500 },
]

export function computeBadges(input: BadgeInput): BadgeStatus[] {
  return BADGE_DEFINITIONS.map((def) => {
    const { currentValue, unlocked, progress } = evaluate(def, input)
    return { definition: def, unlocked, progress, currentValue }
  })
}

function evaluate(
  def: BadgeDefinition,
  input: BadgeInput,
): { currentValue: number; unlocked: boolean; progress: number } {
  switch (def.category) {
    case 'participation':
      return makeResult(input.participationCount, def.threshold)
    case 'kill':
      return makeResult(input.kills, def.threshold)
    case 'deathless':
      return makeResult(input.deathlessLongestStreak, def.threshold)
    case 'survival': {
      if (
        input.evaluatedEvents < SURVIVAL_MIN_EVALUATED ||
        input.survivalRate == null
      ) {
        return { currentValue: 0, unlocked: false, progress: 0 }
      }
      const v = Math.round(input.survivalRate * 100)
      return makeResult(v, def.threshold)
    }
    case 'streak':
      return makeResult(input.participationLongestStreak, def.threshold)
    case 'win':
      return makeResult(input.wins, def.threshold)
  }
}

function makeResult(
  currentValue: number,
  threshold: number,
): { currentValue: number; unlocked: boolean; progress: number } {
  const unlocked = currentValue >= threshold
  const progress = threshold === 0 ? 1 : Math.min(1, currentValue / threshold)
  return { currentValue, unlocked, progress }
}

export function countUnlocked(statuses: ReadonlyArray<BadgeStatus>): number {
  return statuses.reduce((acc, s) => acc + (s.unlocked ? 1 : 0), 0)
}
