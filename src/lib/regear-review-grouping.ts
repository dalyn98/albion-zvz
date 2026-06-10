import { type AdminRegearRequest } from '@/app/actions/regear-admin'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { compareStrings } from '@/lib/sort-strings'

export const REGEAR_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

export interface EventGroupRow {
  // 그룹 식별 키. event_id 또는 regear_window_id, 둘 다 없으면 합성 키.
  groupKey: string
  eventId: string
  eventTitle: string
  rows: AdminRegearRequest[]
}

// 한 (event_id, discord_id) 의 묶음. EventGroup 안에서 한 청구자가 같은
// 이벤트에 N번 죽었을 때 카드들을 한 청구자 단위로 묶어 노출. DB 스키마는
// 그대로 — UI 상의 그룹핑일 뿐. 일괄 승인 버튼은 pendingIds 만 사용한다.
export interface ClaimerSubGroup {
  discordId: string
  username: string
  rows: AdminRegearRequest[]
  pendingIds: string[]
  pendingCount: number
  totalClaimed: number
  pendingPayout: number
  screenshotCount: number
}

// 청구자가 부위별 가격을 직접 수정한 자동 리기어 행. 자동 청구는 AODP 추정으로
// 가격이 매겨지지만 사망자가 실제 장비/품질로 수정해 둔 행은 관리자가 우선
// 검토해야 한다 (편집 자체가 "AODP 가 잘못됐다" 는 신호이기 때문). 수동 청구는
// breakdown_items 가 비어 false 가 자연스럽게 나온다.
export function hasUserEdits(request: AdminRegearRequest): boolean {
  return request.breakdown_items.some((item) => item.user_edited)
}

// 멤버가 `/regear` 의 트래킹 사망 자가신청 흐름으로 직접 등록한 행. cron 자동
// 청구가 아니라 본인이 누른 청구지만, 킬보드로 자동 검증되어 스크린샷이 없고
// 제목이 "[트래킹 전투] ..." 라 cron 자동 청구로 오인되기 쉽다. 어드민이
// 한눈에 구분할 수 있도록 별도 배지를 띄운다. event_id/regear_window_id 가
// 모두 비고 killboard_event_id 가 채워진 게 자가신청의 시그니처다 (그 외
// 이벤트 윈도우/일반 청구는 둘 중 하나가 채워진다).
export function isMemberSelfClaim(request: AdminRegearRequest): boolean {
  return (
    !request.auto_generated &&
    !request.event_id &&
    !request.regear_window_id &&
    request.killboard_event_id !== null
  )
}

// 같은 멤버의 신청을 인접하게 묶고, 멤버 그룹들끼리는 그 멤버의 가장 최근 신청
// 시각 기준 desc. 한 멤버 안에서는 created_at desc. 동률은 discord_id 로 안정화.
// 1차 키로 hasUserEdits 를 두어 청구자가 가격을 수정한 행을 그룹 최상단에 띄운다.
export function clusterRowsByMember(rows: AdminRegearRequest[]): AdminRegearRequest[] {
  const memberLatest = new Map<string, string>()
  for (const r of rows) {
    const cur = memberLatest.get(r.discord_id)
    if (!cur || r.created_at > cur) memberLatest.set(r.discord_id, r.created_at)
  }
  return [...rows].sort((a, b) => {
    const aEdited = hasUserEdits(a) ? 1 : 0
    const bEdited = hasUserEdits(b) ? 1 : 0
    if (aEdited !== bEdited) return bEdited - aEdited
    if (a.discord_id !== b.discord_id) {
      const al = memberLatest.get(a.discord_id) ?? ''
      const bl = memberLatest.get(b.discord_id) ?? ''
      if (al !== bl) return compareStrings(bl, al)
      return compareStrings(a.discord_id, b.discord_id)
    }
    return compareStrings(b.created_at, a.created_at)
  })
}

export function buildClaimerGroups(
  rows: AdminRegearRequest[],
  ratePercent: number,
): ClaimerSubGroup[] {
  const map = new Map<string, ClaimerSubGroup>()
  for (const r of rows) {
    let g = map.get(r.discord_id)
    if (!g) {
      g = {
        discordId: r.discord_id,
        username: r.username,
        rows: [],
        pendingIds: [],
        pendingCount: 0,
        totalClaimed: 0,
        pendingPayout: 0,
        screenshotCount: 0,
      }
      map.set(r.discord_id, g)
    }
    g.rows.push(r)
    if (r.screenshot_path) g.screenshotCount += 1
    if (r.screenshot_path_2) g.screenshotCount += 1
    if (r.status === 'pending') {
      g.pendingCount += 1
      g.pendingIds.push(r.id)
      const claimed = r.claimed_silver ?? r.silver
      g.totalClaimed += claimed
      g.pendingPayout += calcPayoutSilver(claimed, r.payout_rate_percent ?? ratePercent)
    }
  }
  for (const g of map.values()) {
    // hasUserEdits 우선, 그 다음 created_at desc — RegearRow 단일 노출 케이스와
    // 동일한 정렬을 그룹 안에도 적용해 친숙하게.
    g.rows.sort((a, b) => {
      const aE = hasUserEdits(a) ? 1 : 0
      const bE = hasUserEdits(b) ? 1 : 0
      if (aE !== bE) return bE - aE
      return b.created_at.localeCompare(a.created_at)
    })
  }
  return [...map.values()].sort((a, b) =>
    b.rows[0].created_at.localeCompare(a.rows[0].created_at),
  )
}
