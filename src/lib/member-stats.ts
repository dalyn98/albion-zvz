// 멤버 프로필 통계 계산 로직 — 순수 함수로 분리하여 fetchMemberDetail 을
// 얇게 유지. 시간 윈도우, 스트릭 판정 등 비즈니스 규칙을 한 곳에 모아둔다.

const DAY_MS = 24 * 60 * 60 * 1000

export interface BattleParticipationOutcome {
  // tenant_battle_records.started_at (padding 제외 원본). 일자 스트릭 계산에도
  // 이 값을 재사용.
  startedAt: string
  // 해당 배틀에서 멤버의 killboard 에 victim 기록이 있으면 true. 여러 번 죽었어도
  // true 1개로 집계 (한 배틀 = 한 번의 "데스 여부").
  hadDeath: boolean
}

export interface SurvivalResult {
  // null = 평가 가능한 배틀 참여 0건 (killboard 에 매칭되는 트래킹 배틀 없음)
  survivalRate: number | null
  evaluatedEvents: number
  currentDeathlessStreak: number
  longestDeathlessStreak: number
}

// 멤버가 참여한 트래킹 배틀 (killboard 에 한 건이라도 있는 배틀) 목록을 받아
// 생존률 / 무데스 스트릭을 계산. 배틀을 시간 오름차순으로 훑으면서 running 을
// 누적한다. ±N 시간 창에서 victim 을 재탐색할 필요 없음 — 배틀 단위로 이미
// hadDeath 가 확정되어 들어온다.
export function calcSurvivalFromBattles(
  battles: ReadonlyArray<BattleParticipationOutcome>,
): SurvivalResult {
  if (battles.length === 0) {
    return {
      survivalRate: null,
      evaluatedEvents: 0,
      currentDeathlessStreak: 0,
      longestDeathlessStreak: 0,
    }
  }
  const sorted = [...battles].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  let deathCount = 0
  let longest = 0
  let running = 0
  for (const b of sorted) {
    if (b.hadDeath) {
      if (running > longest) longest = running
      running = 0
      deathCount += 1
    } else {
      running += 1
      if (running > longest) longest = running
    }
  }
  const evaluated = sorted.length
  return {
    survivalRate: (evaluated - deathCount) / evaluated,
    evaluatedEvents: evaluated,
    currentDeathlessStreak: running,
    longestDeathlessStreak: longest,
  }
}

export interface StreakResult {
  currentStreak: number
  longestStreak: number
}

// 참여 날짜(테넌트 시간대) 를 기준으로 연속 일자 스트릭을 집계. 같은 날 여러
// 이벤트 참여는 하루로 합산. 마지막 참여가 오늘/어제면 current 가 살아있고,
// 그보다 오래 전이면 current = 0 (스트릭 끊김).
//
// tz 는 IANA 문자열. 기본값은 'Asia/Seoul' — 호출자가 명시하지 않으면 기존
// 멘헤라 동작 유지. EU/NA 길드 호출 시에는 자정 기준이 그쪽 기준으로 잡힌다.
export function calcParticipationStreak(
  eventIsoDates: ReadonlyArray<string>,
  nowMs: number,
  tz: string = 'Asia/Seoul',
): StreakResult {
  const dayKeys = new Set<string>()
  for (const iso of eventIsoDates) {
    const k = toTenantDateKey(new Date(iso), tz)
    if (k) dayKeys.add(k)
  }
  const sorted = Array.from(dayKeys).sort()
  if (sorted.length === 0) return { currentStreak: 0, longestStreak: 0 }

  let longest = 1
  let running = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDateKey(sorted[i - 1])
    const cur = parseDateKey(sorted[i])
    if (prev == null || cur == null) {
      running = 1
      continue
    }
    const diffDays = Math.round((cur - prev) / DAY_MS)
    running = diffDays === 1 ? running + 1 : 1
    if (running > longest) longest = running
  }

  const lastKey = sorted[sorted.length - 1]
  const todayKey = toTenantDateKey(new Date(nowMs), tz)
  if (!todayKey) return { currentStreak: 0, longestStreak: longest }
  const lastMs = parseDateKey(lastKey)
  const todayMs = parseDateKey(todayKey)
  if (lastMs == null || todayMs == null) {
    return { currentStreak: 0, longestStreak: longest }
  }
  const gap = Math.round((todayMs - lastMs) / DAY_MS)
  const current = gap <= 1 ? running : 0
  return { currentStreak: current, longestStreak: longest }
}

function toTenantDateKey(d: Date, tz: string): string | null {
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return null
  return `${y}-${m}-${day}`
}

function parseDateKey(key: string): number | null {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  return Date.UTC(y, m - 1, d)
}

export interface OutcomeStats {
  wins: number
  losses: number
  // wins + losses. outcome 이 win/loss 로 확정된 이벤트 수.
  evaluatedEvents: number
  // 평가 이벤트가 0이면 null — "0% 승률" 이 아니라 "평가 불가" 를 명시.
  winRate: number | null
}

// 참여한 이벤트의 outcome 에서 승/패 집계. outcome 이 'win' 또는 'loss' 인
// 경우만 카운트. null(공개 전투 매칭 없음) / 'tie' / 'excluded' 등은 분모에도
// 포함하지 않는다 — 승률을 깎지 않는다.
export function calcOutcomeStats(
  outcomes: ReadonlyArray<string | null>,
): OutcomeStats {
  let wins = 0
  let losses = 0
  for (const o of outcomes) {
    if (o === 'win') wins += 1
    else if (o === 'loss') losses += 1
  }
  const evaluated = wins + losses
  return {
    wins,
    losses,
    evaluatedEvents: evaluated,
    winRate: evaluated > 0 ? wins / evaluated : null,
  }
}

export interface RankingResult {
  // 1-based rank. null = 본인 카운트 0 또는 랭킹 대상이 없음.
  rank: number | null
  // 카운트 > 0 인 멤버 수 (rank 분모).
  totalRanked: number
  // 상위 N% (1~100). 값이 작을수록 상위. null = rank 없음.
  percentile: number | null
}

// 본인 카운트와 길드 전체 멤버 카운트 배열로부터 rank / percentile 계산.
// 0 인 멤버는 랭킹 대상에서 제외 — "상위 12%" 의 분모가 의미 있으려면 최소 한
// 번이라도 기여한 멤버들만 놓고 봐야 한다.
export function calcRanking(
  myCount: number,
  allCounts: ReadonlyArray<number>,
): RankingResult {
  const activeCount = allCounts.reduce((acc, c) => (c > 0 ? acc + 1 : acc), 0)
  if (myCount <= 0 || activeCount === 0) {
    return { rank: null, totalRanked: activeCount, percentile: null }
  }
  let higher = 0
  for (const c of allCounts) {
    if (c > myCount) higher += 1
  }
  const rank = higher + 1
  const percentile = Math.max(1, Math.min(100, Math.round((rank / activeCount) * 100)))
  return { rank, totalRanked: activeCount, percentile }
}
