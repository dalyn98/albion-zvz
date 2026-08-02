export const REGEAR_PARTICIPANT_CONFIRMATION_STATUSES = [
  'not_required',
  'awaiting_closeout',
  'confirmed',
  'excluded',
] as const

export type RegearParticipantConfirmationStatus =
  (typeof REGEAR_PARTICIPANT_CONFIRMATION_STATUSES)[number]

export function isRegearParticipantConfirmationStatus(
  value: unknown,
): value is RegearParticipantConfirmationStatus {
  return (
    typeof value === 'string' &&
    (REGEAR_PARTICIPANT_CONFIRMATION_STATUSES as readonly string[]).includes(value)
  )
}

export function canApproveRegearParticipantStatus(
  status: RegearParticipantConfirmationStatus,
): boolean {
  return status === 'not_required' || status === 'confirmed'
}
