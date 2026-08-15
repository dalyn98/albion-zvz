export type ExchangeHoldStatus =
  | 'legacy_unheld'
  | 'held'
  | 'consumed'
  | 'released'

export type ExchangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export type ExchangePayoutStatusTranslationKey =
  | 'statusPending'
  | 'statusApproved'
  | 'statusRejected'
  | 'statusCancelled'

interface ExchangePayoutReadinessInput {
  balance: number
  silver: number
  heldPoints: number
  holdStatus: ExchangeHoldStatus
}

export interface ExchangePayoutReadiness {
  balanceAfterPayout: number
  hasSufficientBalance: boolean
  isHoldSecured: boolean
  canCompletePayout: boolean
}

export function getExchangePayoutStatusTranslationKey(
  status: ExchangeRequestStatus,
): ExchangePayoutStatusTranslationKey {
  if (status === 'pending') return 'statusPending'
  if (status === 'approved') return 'statusApproved'
  if (status === 'cancelled') return 'statusCancelled'
  return 'statusRejected'
}

/**
 * Exchange requests are accepted only after points are reserved. Legacy
 * requests may still be completed after the payout RPC revalidates the live
 * balance, but any other incomplete hold projection must stay fail-closed.
 */
export function getExchangePayoutReadiness({
  balance,
  silver,
  heldPoints,
  holdStatus,
}: ExchangePayoutReadinessInput): ExchangePayoutReadiness {
  const hasSufficientBalance = balance >= silver
  const isHoldSecured = holdStatus === 'held' && heldPoints === silver
  const isLegacyRequest = holdStatus === 'legacy_unheld' && heldPoints === 0

  return {
    balanceAfterPayout: balance - silver,
    hasSufficientBalance,
    isHoldSecured,
    canCompletePayout:
      hasSufficientBalance && (isHoldSecured || isLegacyRequest),
  }
}
