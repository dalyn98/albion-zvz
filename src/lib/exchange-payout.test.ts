import { describe, expect, it } from 'vitest'
import {
  getExchangePayoutReadiness,
  getExchangePayoutStatusTranslationKey,
} from './exchange-payout'

describe('exchange payout readiness', () => {
  it('keeps a member cancellation distinct from an operator rejection', () => {
    expect(getExchangePayoutStatusTranslationKey('cancelled')).toBe('statusCancelled')
    expect(getExchangePayoutStatusTranslationKey('rejected')).toBe('statusRejected')
  })

  it('marks a fully held request ready and previews the remaining points', () => {
    expect(getExchangePayoutReadiness({
      balance: 7_000_000,
      silver: 2_500_000,
      heldPoints: 2_500_000,
      holdStatus: 'held',
    })).toEqual({
      balanceAfterPayout: 4_500_000,
      hasSufficientBalance: true,
      isHoldSecured: true,
      canCompletePayout: true,
    })
  })

  it('keeps an underfunded held request from being completed', () => {
    expect(getExchangePayoutReadiness({
      balance: 700_000,
      silver: 1_200_000,
      heldPoints: 1_200_000,
      holdStatus: 'held',
    })).toMatchObject({
      balanceAfterPayout: -500_000,
      hasSufficientBalance: false,
      isHoldSecured: true,
      canCompletePayout: false,
    })
  })

  it('allows a funded legacy request while blocking a malformed hold', () => {
    expect(getExchangePayoutReadiness({
      balance: 2_000_000,
      silver: 1_000_000,
      heldPoints: 0,
      holdStatus: 'legacy_unheld',
    }).canCompletePayout).toBe(true)

    expect(getExchangePayoutReadiness({
      balance: 2_000_000,
      silver: 1_000_000,
      heldPoints: 500_000,
      holdStatus: 'held',
    }).canCompletePayout).toBe(false)
  })
})
