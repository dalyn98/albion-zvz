// tenant_battle_records 필터를 통과한 "진짜 전투" 의 시간창. 업적/통계
// (리더보드, 내 홈, 멤버 상세 등) 에 집계할 killboard_events 를 이 창들로
// 제한하는 용도. 1:1 갱킹/소규모 전투는 애초에 tenant_battle_records 에 못
// 들어오므로 이 창에도 포함되지 않아 자동으로 제외된다.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1)

import type { getAdminClient } from '@/lib/supabase-admin'

type Db = ReturnType<typeof getAdminClient>

export interface TrackedBattleWindow {
  startedAtMs: number
  endedAtMs: number
  // tenant_battle_records.outcome — 'win' | 'loss' | 'tie'. 승/패 집계에 사용.
  outcome: string
}

// battle_records.ended_at 은 정확한 종료 시각. ±0 으로 매칭해도 sync cron 이
// 끌어온 killboard 이벤트가 전투 마지막 순간을 간발의 차로 놓치는 일이 생겨
// 작은 버퍼를 둔다. 15분이면 정리전/리스폰 후 폭딜 같은 꼬리 전투도 커버.
const WINDOW_PADDING_MS = 15 * 60 * 1000

export async function fetchTrackedBattleWindows(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
): Promise<TrackedBattleWindow[]> {
  let q = db
    .from('tenant_battle_records')
    .select('started_at, outcome, battle_records!inner(ended_at)')
    .eq('guild_id', guildId)
  if (sinceIso) q = q.gte('started_at', sinceIso)

  const { data } = await q
  type Row = {
    started_at: string
    outcome: string
    battle_records:
      | { ended_at: string | null }
      | { ended_at: string | null }[]
      | null
  }
  const windows: TrackedBattleWindow[] = []
  for (const row of (data ?? []) as Row[]) {
    const br = Array.isArray(row.battle_records) ? row.battle_records[0] : row.battle_records
    if (!br?.ended_at) continue
    const startMs = Date.parse(row.started_at)
    const endMs = Date.parse(br.ended_at)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    windows.push({
      startedAtMs: startMs - WINDOW_PADDING_MS,
      endedAtMs: endMs + WINDOW_PADDING_MS,
      outcome: row.outcome,
    })
  }
  windows.sort((a, b) => a.startedAtMs - b.startedAtMs)
  return windows
}

// occurredAt(ISO) 이 하나 이상의 tracked window 에 들어오는지 이분탐색.
// windows 는 startedAtMs 오름차순으로 정렬되어 있어야 하며, 창끼리 겹치는
// 경우도 있을 수 있으므로 "startedAtMs <= t" 인 마지막 창을 찾아 endedAtMs
// 와 비교한다.
export function isWithinTrackedWindow(
  occurredAtIso: string,
  windows: ReadonlyArray<TrackedBattleWindow>,
): boolean {
  return findTrackedWindow(occurredAtIso, windows) !== null
}

// 이벤트의 battle_started_at 에 매칭되는 tracked window 를 찾아 outcome 을
// 돌려준다. 없으면 null (공개 전투로 집계된 배틀이 없어 승/패 판정 불가).
export function findTrackedOutcome(
  occurredAtIso: string | null,
  windows: ReadonlyArray<TrackedBattleWindow>,
): string | null {
  if (!occurredAtIso) return null
  return findTrackedWindow(occurredAtIso, windows)?.outcome ?? null
}

function findTrackedWindow(
  occurredAtIso: string,
  windows: ReadonlyArray<TrackedBattleWindow>,
): TrackedBattleWindow | null {
  if (windows.length === 0) return null
  const t = Date.parse(occurredAtIso)
  if (!Number.isFinite(t)) return null
  // 첫 번째로 startedAtMs > t 인 인덱스. 그 바로 앞까지가 후보.
  let lo = 0
  let hi = windows.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (windows[mid].startedAtMs <= t) lo = mid + 1
    else hi = mid
  }
  // 후보는 [0, lo) 내의 창들. 하지만 overlap 이 있을 수 있어
  // 인접 몇 개만 스캔하면 충분하다 — 모두 훑지 않아도 되도록 최근 20개로 상한.
  const start = Math.max(0, lo - 20)
  for (let i = start; i < lo; i++) {
    if (t <= windows[i].endedAtMs) return windows[i]
  }
  return null
}
