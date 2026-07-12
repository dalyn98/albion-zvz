export type HomeEventMyStatus = 'assigned' | 'pending' | 'tentative' | 'available'

interface HomeEventMyStatusInput {
  hasAssignedSlot: boolean
  hasPendingSlot: boolean
  hasTentativeSignup: boolean
  hasAvailableSlot: boolean
}

// 홈 카드에서는 사용자가 즉시 판단할 수 있는 상태 하나만 보여준다. 실제 배정은
// 신청 대기/참가예정보다 우선하며, 참가예정은 슬롯이 비어 있어도 그 의도를 보존한다.
export function resolveHomeEventMyStatus({
  hasAssignedSlot,
  hasPendingSlot,
  hasTentativeSignup,
  hasAvailableSlot,
}: HomeEventMyStatusInput): HomeEventMyStatus | null {
  if (hasAssignedSlot) return 'assigned'
  if (hasPendingSlot) return 'pending'
  if (hasTentativeSignup) return 'tentative'
  if (hasAvailableSlot) return 'available'
  return null
}
