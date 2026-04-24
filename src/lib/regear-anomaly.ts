import type { AdminRegearRequest } from '@/app/actions/regear-admin'

// 리기어 이상치 플래그. 관리자가 승인 전에 한 번 더 들여다봐야 하는 신호들.
// - 차단이 아니라 "경고" 용도. 승인 결정은 여전히 관리자가 내린다.
// - 모든 플래그는 현재 스키마에서 계산 가능. 마이그 없음.
export type RegearAnomalyFlag =
  | 'unverified_manual' // 킬보드 미검증 + 자동 생성 아님 = 수동 스크린샷 단독 청구
  | 'high_frequency' // 최근 7일 승인 건수 >= 임계치
  | 'price_overclaim' // claimed_silver 가 estimated_silver 대비 과도
  | 'price_warning_high' // price_warning_level = 'redzone' 또는 'window'
  | 'user_edited_breakdown' // 자동 건인데 청구자가 gear_breakdown 을 수정
  | 'duplicate_event' // 같은 이벤트에서 같은 청구자가 여러 건 (설정 한도 초과 가능성)

export interface RegearAnomalyContext {
  // 해당 discord_id 의 최근 7일 간 승인된 regear 건수 (현재 요청 제외).
  userApprovedCount7d: number
  // 같은 (event_id, discord_id) 조합의 pending+approved 건수 (현재 포함).
  sameEventCount: number
}

// 청구 금액이 추산 시장가의 N 배를 초과하면 과다 청구로 본다.
// 1.5 배는 "AODP 기반 추산이 완벽하지 않다"는 전제로 넉넉히 잡은 수치.
const OVERCLAIM_RATIO = 1.5
// 최근 7일 5 건 이상 승인 이력이면 "자주 죽는다" 경고.
const HIGH_FREQUENCY_THRESHOLD = 5

export function computeRegearAnomalies(
  request: AdminRegearRequest,
  context: RegearAnomalyContext,
): RegearAnomalyFlag[] {
  const flags: RegearAnomalyFlag[] = []

  if (!request.killboard_verified && !request.auto_generated) {
    flags.push('unverified_manual')
  }

  if (context.userApprovedCount7d >= HIGH_FREQUENCY_THRESHOLD) {
    flags.push('high_frequency')
  }

  const claimed = request.claimed_silver ?? request.silver
  const estimated = request.estimated_silver
  if (estimated !== null && estimated > 0 && claimed > estimated * OVERCLAIM_RATIO) {
    flags.push('price_overclaim')
  }

  if (
    request.price_warning_level === 'redzone' ||
    request.price_warning_level === 'window'
  ) {
    flags.push('price_warning_high')
  }

  if (
    request.auto_generated &&
    request.breakdown_items.some((item) => item.user_edited)
  ) {
    flags.push('user_edited_breakdown')
  }

  if (context.sameEventCount > 1) {
    flags.push('duplicate_event')
  }

  return flags
}

export const ANOMALY_SEVERITY: Record<RegearAnomalyFlag, 'high' | 'medium' | 'low'> = {
  price_overclaim: 'high',
  duplicate_event: 'high',
  high_frequency: 'medium',
  unverified_manual: 'medium',
  price_warning_high: 'medium',
  user_edited_breakdown: 'low',
}
