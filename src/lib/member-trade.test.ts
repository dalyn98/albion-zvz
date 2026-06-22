import { describe, expect, it } from 'vitest'
import {
  computeSpendablePointBalance,
  isMemberTradeBuyerActionAllowed,
  isMemberTradeListingPurchasable,
  normalizeMemberTradeQuantity,
  type MemberTradeOrderStatus,
} from './member-trade'

describe('member trade domain helpers', () => {
  it('subtracts active escrow from spendable points without going below zero', () => {
    expect(computeSpendablePointBalance({ balance: 10_000, escrowed: 2_500 })).toBe(7_500)
    expect(computeSpendablePointBalance({ balance: 1_000, escrowed: 2_500 })).toBe(0)
  })

  it('rejects invalid listing quantities before a purchase reaches the RPC', () => {
    expect(normalizeMemberTradeQuantity(1)).toBe(1)
    expect(normalizeMemberTradeQuantity('12')).toBe(12)
    expect(normalizeMemberTradeQuantity('0')).toBeNull()
    expect(normalizeMemberTradeQuantity(1.5)).toBeNull()
  })

  it('only exposes active listings with available stock and non-expired windows', () => {
    const now = new Date('2026-06-22T12:00:00.000Z')

    expect(
      isMemberTradeListingPurchasable({
        status: 'active',
        quantityAvailable: 2,
        expiresAt: '2026-06-23T12:00:00.000Z',
        now,
      }),
    ).toBe(true)
    expect(
      isMemberTradeListingPurchasable({
        status: 'active',
        quantityAvailable: 0,
        expiresAt: '2026-06-23T12:00:00.000Z',
        now,
      }),
    ).toBe(false)
    expect(
      isMemberTradeListingPurchasable({
        status: 'active',
        quantityAvailable: 1,
        expiresAt: '2026-06-21T12:00:00.000Z',
        now,
      }),
    ).toBe(false)
  })

  it('limits buyer confirmation to delivered member-trade orders', () => {
    const allowed: MemberTradeOrderStatus[] = ['delivered']
    const blocked: MemberTradeOrderStatus[] = [
      'awaiting_delivery',
      'completed',
      'cancelled',
      'disputed',
      'refunded',
    ]

    for (const status of allowed) {
      expect(isMemberTradeBuyerActionAllowed(status, 'confirm')).toBe(true)
    }
    for (const status of blocked) {
      expect(isMemberTradeBuyerActionAllowed(status, 'confirm')).toBe(false)
    }
  })
})
