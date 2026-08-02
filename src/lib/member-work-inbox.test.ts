import { describe, expect, it } from 'vitest'
import {
  buildMemberWorkInboxSnapshot,
  createEmptyMemberWorkInboxSnapshot,
} from './member-work-inbox'

function row(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'regear:1',
    domain: 'regear',
    source_id: 'source-1',
    bucket: 'waiting_on_guild',
    stage: 'regear_review',
    status: 'pending',
    title: 'CTA',
    amount: '1000',
    unit: 'silver',
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    due_at: null,
    href: '/me/regear/source-1',
    next_actor: 'guild',
    metadata: {},
    ...overrides,
  }
}

describe('member work inbox snapshot', () => {
  it('separates action, waiting, and history without duplicating a source item', () => {
    const snapshot = buildMemberWorkInboxSnapshot([
      row(),
      row({ item_key: 'shop:1', domain: 'shop', source_id: 'shop-1', bucket: 'action_required', stage: 'shop_price_confirmation', href: '/shop#shop-order-1', next_actor: 'member' }),
      row({ item_key: 'shop:1', domain: 'shop', source_id: 'shop-1', bucket: 'history', stage: 'completed', href: '/shop#shop-order-1', next_actor: 'none' }),
      row({ item_key: 'exchange:1', domain: 'exchange', source_id: 'exchange-1', bucket: 'history', stage: 'completed', status: 'approved', href: '/me/wallet', next_actor: 'none', updated_at: '2026-08-02T10:00:00Z' }),
    ])

    expect(snapshot.actionRequired.map((item) => item.itemKey)).toEqual(['shop:1'])
    expect(snapshot.waitingOnGuild.map((item) => item.itemKey)).toEqual(['regear:1'])
    expect(snapshot.history.map((item) => item.itemKey)).toEqual(['exchange:1'])
    expect(snapshot.activeCount).toBe(2)
    expect(snapshot.activeCountsByDomain.shop).toBe(1)
    expect(snapshot.activeCountsByDomain.regear).toBe(1)
  })

  it('prioritizes due work and then the oldest active work', () => {
    const snapshot = buildMemberWorkInboxSnapshot([
      row({ item_key: 'trade:late', domain: 'member_trade', source_id: 'late', bucket: 'action_required', stage: 'trade_seller_delivery', href: '/market', next_actor: 'member', due_at: '2026-08-04T00:00:00Z' }),
      row({ item_key: 'trade:urgent', domain: 'member_trade', source_id: 'urgent', bucket: 'action_required', stage: 'trade_seller_delivery', href: '/market', next_actor: 'member', due_at: '2026-08-03T00:00:00Z' }),
      row({ item_key: 'treasury:old', domain: 'treasury_deposit', source_id: 'old', bucket: 'action_required', stage: 'treasury_purpose', href: '/me/wallet', next_actor: 'member', created_at: '2026-07-01T00:00:00Z' }),
    ])

    expect(snapshot.actionRequired.map((item) => item.itemKey)).toEqual([
      'trade:urgent',
      'trade:late',
      'treasury:old',
    ])
    expect(snapshot.topAction?.itemKey).toBe('trade:urgent')
  })

  it('drops malformed rows and unsafe links fail closed', () => {
    const snapshot = buildMemberWorkInboxSnapshot([
      row({ item_key: 'bad-domain', domain: 'battlelog' }),
      row({ item_key: 'bad-link', href: 'https://example.com' }),
      row({ item_key: 'bad-date', created_at: 'not-a-date' }),
    ])
    expect(snapshot.activeCount).toBe(0)
    expect(snapshot.history).toEqual([])
  })

  it('marks an unavailable source separately from a valid empty inbox', () => {
    expect(createEmptyMemberWorkInboxSnapshot().available).toBe(true)
    expect(createEmptyMemberWorkInboxSnapshot(false).available).toBe(false)
  })
})
