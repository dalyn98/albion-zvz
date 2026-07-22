export type ApprovalActionState =
  | { status: 'idle' }
  | { status: 'review'; action: string; subjectId: string }
  | { status: 'pending'; action: string; subjectId: string }
  | { status: 'failed'; action: string; subjectId: string; error: string }
  | { status: 'completed'; action: string; subjectId: string; receipt: string }

export const initialApprovalActionState: ApprovalActionState = { status: 'idle' }

export function requestApprovalReview(
  _state: ApprovalActionState,
  action: string,
  subjectId: string,
): ApprovalActionState {
  return { status: 'review', action, subjectId }
}

export function startApprovalAction(state: ApprovalActionState): ApprovalActionState {
  if (state.status === 'idle' || state.status === 'completed') return state
  return { status: 'pending', action: state.action, subjectId: state.subjectId }
}

export function failApprovalAction(
  state: ApprovalActionState,
  error: string,
): ApprovalActionState {
  if (state.status !== 'pending') return state
  return { status: 'failed', action: state.action, subjectId: state.subjectId, error }
}

export function completeApprovalAction(
  state: ApprovalActionState,
  receipt: string,
): ApprovalActionState {
  if (state.status !== 'pending') return state
  return { status: 'completed', action: state.action, subjectId: state.subjectId, receipt }
}

export function retryApprovalAction(state: ApprovalActionState): ApprovalActionState {
  if (state.status !== 'failed') return state
  return { status: 'pending', action: state.action, subjectId: state.subjectId }
}
