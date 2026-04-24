// tenant_battle_records 필터를 통과한 "진짜 전투" 의 시간창. 업적/통계
// (리더보드, 내 홈, 멤버 상세 등) 에 집계할 killboard_events 를 이 창들로
// 제한하는 용도. 1:1 갱킹/소규모 전투는 애초에 tenant_battle_records 에 못
// 들어오므로 이 창에도 포함되지 않아 자동으로 제외된다.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1)

import type { getAdminClient } from '@/lib/supabase-admin'

type Db = ReturnType<typeof getAdminClient>

export interface TrackedBattleWindow {
  // 창 안/밖 판정용 (padding 포함). isWithinTrackedWindow 가 이 범위로 판단.
  startedAtMs: number
  endedAtMs: number
  // padding 제외한 원본 tenant_battle_records.started_at. 참여 일자/스트릭
  // 집계에 사용 — padding 은 매칭용이라 날짜 산정에는 쓰지 않는다.
  rawStartedAt: string
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
      rawStartedAt: row.started_at,
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

// 이벤트가 속한 tracked battle 의 raw started_at 을 돌려준다 — 배틀 단위
// 그룹핑 키로 사용. 같은 키가 나오는 killboard row 들은 같은 전투이므로,
// 무기 사용 통계처럼 "1전투당 한 번" 집계가 필요할 때 이 키로 Set 을 만든다.
export function findTrackedBattleKey(
  occurredAtIso: string | null,
  windows: ReadonlyArray<TrackedBattleWindow>,
): string | null {
  if (!occurredAtIso) return null
  return findTrackedWindow(occurredAtIso, windows)?.rawStartedAt ?? null
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

// 멤버의 killboard 이벤트를 트래킹 배틀 창 단위로 묶어 "참여한 배틀" 목록으로
// 반환. 창 밖의 킬은 무시 (1:1 갱킹 등). 참여 배틀 하나에 복수 킬/데스가
// 있으면 합산.
//
// 설계 의도: 업적/통계의 진짜 소스는 killboard + tenant_battle_records + raw_battle.players.
// 과거에는 events.battle_started_at 으로 참여를 판정했지만 자동시작 등으로
// 시각이 어긋나 매칭 실패 → 0 통계가 빈발.
//
// 0k0d 참여자는 killboard 에 흔적이 없으므로 이 함수만으로는 잡히지 않는다.
// 완전한 participation 집합을 얻으려면 mergeMemberBattles 로 raw_battle.players
// 기반 참여자(fetchMemberBattleParticipations 결과) 와 합쳐야 한다.
export interface MemberBattleOutcome {
  // padding 제외 원본 started_at (일자 기준 스트릭 등에 사용).
  startedAt: string
  outcome: string
  hadDeath: boolean
  killCount: number
  deathCount: number
}

export function groupMemberKillsByBattle<
  K extends { role: string | null; occurred_at: string | null },
>(
  kills: ReadonlyArray<K>,
  windows: ReadonlyArray<TrackedBattleWindow>,
): MemberBattleOutcome[] {
  if (windows.length === 0 || kills.length === 0) return []
  // windows 인덱스 기준으로 집계. 정렬은 startedAtMs 오름차순 보장되어 있음.
  const agg = new Map<number, MemberBattleOutcome>()
  for (const k of kills) {
    if (!k.occurred_at) continue
    const idx = findTrackedWindowIndex(k.occurred_at, windows)
    if (idx == null) continue
    const w = windows[idx]
    let entry = agg.get(idx)
    if (!entry) {
      entry = {
        startedAt: w.rawStartedAt,
        outcome: w.outcome,
        hadDeath: false,
        killCount: 0,
        deathCount: 0,
      }
      agg.set(idx, entry)
    }
    if (k.role === 'killer') entry.killCount += 1
    else if (k.role === 'victim') {
      entry.deathCount += 1
      entry.hadDeath = true
    }
  }
  return Array.from(agg.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

// battle_records.raw_battle.players ↔ guild_avatars 매칭 결과를 멤버별로 그룹.
// member_battle_participations RPC (마이그 082) 가 (discord_id, raw_started_at,
// outcome) 쌍을 돌려주면 이 함수가 discord_id → (raw_started_at → outcome) 맵으로
// 재정리. mergeMemberBattles 에서 killboard 기반 battles 와 합치는 재료.
//
// 0k0d 멤버도 raw_battle.players 에 있으면 여기 잡힘 → participation 집계에서
// 누락 안 됨.
export interface BattleParticipationRow {
  discord_id: string | null
  raw_started_at: string | null
  outcome: string | null
}

export async function fetchMemberBattleParticipations(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
): Promise<Map<string, Map<string, string>>> {
  const { data } = await db.rpc('member_battle_participations', { p_guild_id: guildId })
  const byMember = new Map<string, Map<string, string>>()
  const sinceMs = sinceIso ? Date.parse(sinceIso) : null
  for (const row of (data ?? []) as BattleParticipationRow[]) {
    if (!row.discord_id || !row.raw_started_at) continue
    if (sinceMs !== null) {
      const t = Date.parse(row.raw_started_at)
      if (!Number.isFinite(t) || t < sinceMs) continue
    }
    let inner = byMember.get(row.discord_id)
    if (!inner) {
      inner = new Map<string, string>()
      byMember.set(row.discord_id, inner)
    }
    inner.set(row.raw_started_at, row.outcome ?? '')
  }
  return byMember
}

// killboard 기반 battles 와 raw_battle.players 기반 participation 집합을 합쳐
// 최종 MemberBattleOutcome 배열을 만든다. killboard 에 기록이 없는 참여(0k0d) 는
// killCount=0, deathCount=0, hadDeath=false 로 추가. 같은 startedAt 이 양쪽 다
// 있으면 killboard 쪽을 우선 (더 풍부한 정보).
export function mergeMemberBattles(
  killBattles: ReadonlyArray<MemberBattleOutcome>,
  memberParticipations: ReadonlyMap<string, string> | undefined,
): MemberBattleOutcome[] {
  const byStart = new Map<string, MemberBattleOutcome>()
  for (const b of killBattles) byStart.set(b.startedAt, b)
  if (memberParticipations) {
    for (const [rawStart, outcome] of memberParticipations) {
      if (!byStart.has(rawStart)) {
        byStart.set(rawStart, {
          startedAt: rawStart,
          outcome,
          hadDeath: false,
          killCount: 0,
          deathCount: 0,
        })
      }
    }
  }
  return Array.from(byStart.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function findTrackedWindowIndex(
  occurredAtIso: string,
  windows: ReadonlyArray<TrackedBattleWindow>,
): number | null {
  if (windows.length === 0) return null
  const t = Date.parse(occurredAtIso)
  if (!Number.isFinite(t)) return null
  let lo = 0
  let hi = windows.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (windows[mid].startedAtMs <= t) lo = mid + 1
    else hi = mid
  }
  const start = Math.max(0, lo - 20)
  for (let i = start; i < lo; i++) {
    if (t <= windows[i].endedAtMs) return i
  }
  return null
}
