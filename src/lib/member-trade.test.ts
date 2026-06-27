import { describe, expect, it } from 'vitest'
import {
  computeSpendablePointBalance,
  getNextMemberTradeItemSearchIndex,
  isMemberTradeBuyerActionAllowed,
  isMemberTradeListingPurchasable,
  normalizeMemberTradePurchaseItems,
  normalizeMemberTradeItemSearchQuery,
  normalizeMemberTradePriceOfferItems,
  normalizeMemberTradeQuantity,
  sanitizeMemberTradeTitle,
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

  it('normalizes listing item searches before hitting the item API', () => {
    expect(normalizeMemberTradeItemSearchQuery('  cleric   robe  ')).toBe('cleric robe')
    expect(normalizeMemberTradeItemSearchQuery('Ｔ４')).toBe('T4')
    expect(normalizeMemberTradeItemSearchQuery(' Ｔ５_ARMOR_LEATHER_HELL@3 ')).toBe(
      'T5_ARMOR_LEATHER_HELL@3',
    )
    expect(normalizeMemberTradeItemSearchQuery('a')).toBeNull()
    expect(normalizeMemberTradeItemSearchQuery('x'.repeat(81))).toBeNull()
    expect(normalizeMemberTradeItemSearchQuery(null)).toBeNull()
  })

  it('wraps listing item search keyboard highlight across visible results', () => {
    expect(getNextMemberTradeItemSearchIndex(-1, 3, 1)).toBe(0)
    expect(getNextMemberTradeItemSearchIndex(0, 3, 1)).toBe(1)
    expect(getNextMemberTradeItemSearchIndex(2, 3, 1)).toBe(0)
    expect(getNextMemberTradeItemSearchIndex(0, 3, -1)).toBe(2)
    expect(getNextMemberTradeItemSearchIndex(1, 0, 1)).toBe(-1)
  })

  it('normalizes member-trade post titles', () => {
    expect(sanitizeMemberTradeTitle('  T8   정리템  ')).toBe('T8 정리템')
    expect(sanitizeMemberTradeTitle('a')).toBeNull()
    expect(sanitizeMemberTradeTitle('x'.repeat(81))).toBeNull()
    expect(sanitizeMemberTradeTitle(null)).toBeNull()
  })

  it('normalizes multi-item purchase selections and rejects unsafe shapes', () => {
    expect(
      normalizeMemberTradePurchaseItems([
        { itemId: '11111111-1111-4111-8111-111111111111', quantity: '2' },
        { itemId: '22222222-2222-4222-8222-222222222222', quantity: 1 },
      ]),
    ).toEqual([
      { itemId: '11111111-1111-4111-8111-111111111111', quantity: 2 },
      { itemId: '22222222-2222-4222-8222-222222222222', quantity: 1 },
    ])

    expect(normalizeMemberTradePurchaseItems([])).toBeNull()
    expect(normalizeMemberTradePurchaseItems([{ itemId: 'bad', quantity: 1 }])).toBeNull()
    expect(
      normalizeMemberTradePurchaseItems([
        { itemId: '11111111-1111-4111-8111-111111111111', quantity: 0 },
      ]),
    ).toBeNull()
    expect(
      normalizeMemberTradePurchaseItems(
        Array.from({ length: 31 }, (_, index) => ({
          itemId: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
          quantity: 1,
        })),
      ),
    ).toBeNull()
  })

  it('normalizes price offer selections with proposed unit points', () => {
    expect(
      normalizeMemberTradePriceOfferItems([
        {
          itemId: '11111111-1111-4111-8111-111111111111',
          quantity: '2',
          unitPoints: '1500',
        },
      ]),
    ).toEqual([
      {
        itemId: '11111111-1111-4111-8111-111111111111',
        quantity: 2,
        unitPoints: 1500,
      },
    ])

    expect(
      normalizeMemberTradePriceOfferItems([
        {
          itemId: '11111111-1111-4111-8111-111111111111',
          quantity: 2,
          unitPoints: 0,
        },
      ]),
    ).toBeNull()
    expect(
      normalizeMemberTradePriceOfferItems([
        {
          itemId: '11111111-1111-4111-8111-111111111111',
          quantity: 2,
          unitPoints: 2_147_483_647,
        },
      ]),
    ).toBeNull()
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
