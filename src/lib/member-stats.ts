// 멤버 프로필 통계 계산 로직 — 순수 함수로 분리하여 fetchMemberDetail 을
// 얇게 유지. 시간 윈도우, 스트릭 판정 등 비즈니스 규칙을 한 곳에 모아둔다.

// 참여 이벤트의 battle_started_at ± 이 창 내부에 victim killboard 행이 있으면
// "이 이벤트 중 데스" 로 간주한다. 2h = 집결 + 전투 + 정리까지 넉넉히 커버.
// ZvZ 는 보통 1h 내 종료되지만 이벤트가 예정보다 지연되는 경우가 있다.
const DEATH_WINDOW_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface ParticipatedEvent {
  eventId: string
  // null = battle_started_at 이 세팅되지 않은 이벤트 — 생존/무데스 판정에서 제외.
  startedAt: string | null
}

export interface SurvivalResult {
  // null = 평가 가능한 이벤트가 0개 (battle_started_at 있는 참여가 없음)
  survivalRate: number | null
  evaluatedEvents: number
  currentDeathlessStreak: number
  longestDeathlessStreak: number
}

// 참여 이벤트 각각에 대해 ±2h 창 안의 victim 기록을 검색, 데스/생존을 집계.
// 이벤트를 시간 오름차순으로 훑으면서 "연속으로 데스 없이 완수한 수" 도 동시에
// 계산한다 — running 이 current, 전 구간 최댓값이 longest.
export function calcSurvivalAndDeathlessStreak(
  events: ReadonlyArray<ParticipatedEvent>,
  victimOccurrences: ReadonlyArray<string>,
): SurvivalResult {
  const victimTimes = victimOccurrences
    .map((iso) => Date.parse(iso))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  const evaluable = events
    .filter((e): e is ParticipatedEvent & { startedAt: string } => e.startedAt != null)
    .map((e) => ({ eventId: e.eventId, time: Date.parse(e.startedAt) }))
    .filter((e) => Number.isFinite(e.time))
    .sort((a, b) => a.time - b.time)

  if (evaluable.length === 0) {
    return {
      survivalRate: null,
      evaluatedEvents: 0,
      currentDeathlessStreak: 0,
      longestDeathlessStreak: 0,
    }
  }

  let deathCount = 0
  let longest = 0
  let running = 0
  for (const ev of evaluable) {
    const hasDeath = hasDeathInWindow(ev.time, victimTimes)
    if (hasDeath) {
      if (running > longest) longest = running
      running = 0
      deathCount += 1
    } else {
      running += 1
      if (running > longest) longest = running
    }
  }

  const evaluated = evaluable.length
  const survivalRate = (evaluated - deathCount) / evaluated
  return {
    survivalRate,
    evaluatedEvents: evaluated,
    currentDeathlessStreak: running,
    longestDeathlessStreak: longest,
  }
}

// 정렬된 victimTimes 에서 eventTime ± DEATH_WINDOW_MS 창에 들어오는 값이 있는지
// 이분탐색으로 확인. O(log n). victimTimes 가 수백~수천 개여도 성능 안정.
function hasDeathInWindow(
  eventTime: number,
  sortedVictimTimes: ReadonlyArray<number>,
): boolean {
  if (sortedVictimTimes.length === 0) return false
  const lo = eventTime - DEATH_WINDOW_MS
  const hi = eventTime + DEATH_WINDOW_MS
  let left = 0
  let right = sortedVictimTimes.length
  while (left < right) {
    const mid = (left + right) >>> 1
    if (sortedVictimTimes[mid] < lo) left = mid + 1
    else right = mid
  }
  return left < sortedVictimTimes.length && sortedVictimTimes[left] <= hi
}

export interface StreakResult {
  currentStreak: number
  longestStreak: number
}

// 참여 날짜(Asia/Seoul) 를 기준으로 연속 일자 스트릭을 집계. 같은 날 여러 이벤트
// 참여는 하루로 합산. 마지막 참여가 오늘/어제면 current 가 살아있고, 그보다 오래
// 전이면 current = 0 (스트릭 끊김).
export function calcParticipationStreak(
  eventIsoDates: ReadonlyArray<string>,
  nowMs: number,
): StreakResult {
  const dayKeys = new Set<string>()
  for (const iso of eventIsoDates) {
    const k = toSeoulDateKey(new Date(iso))
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
  const todayKey = toSeoulDateKey(new Date(nowMs))
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

function toSeoulDateKey(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
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

// 참여한 이벤트의 outcome 에서 승/패 집계. finalized_at 이 있고 outcome 이
// 'win' 또는 'loss' 로 확정된 경우만 카운트. null outcome 이나 미확정 이벤트는
// 분모에도 포함하지 않는다 — "진행 중" 이나 "미판정" 은 승률을 깎지 않는다.
export function calcOutcomeStats(
  events: ReadonlyArray<{
    outcome: string | null
    finalizedAt: string | null
  }>,
): OutcomeStats {
  let wins = 0
  let losses = 0
  for (const e of events) {
    if (!e.finalizedAt) continue
    if (e.outcome === 'win') wins += 1
    else if (e.outcome === 'loss') losses += 1
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
