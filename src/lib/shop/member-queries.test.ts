import { describe, expect, it, vi } from 'vitest'
import { listShopOrdersForMember } from './member-queries'

function createMemberOrdersDb() {
  const ordersQuery = {
    select: vi.fn(() => ordersQuery),
    eq: vi.fn(() => ordersQuery),
    order: vi.fn(() => ordersQuery),
    limit: vi.fn(async () => ({
      data: [
        {
          id: 'order-1',
          total_points: 70,
          price_review_required: true,
          status: 'approved',
          member_note: null,
          admin_note: null,
          pickup_note: null,
          created_at: '2026-06-03T00:00:00.000Z',
          resolved_at: '2026-06-03T00:10:00.000Z',
        },
      ],
      error: null,
    })),
  }
  const itemsQuery = {
    select: vi.fn(() => itemsQuery),
    eq: vi.fn(() => itemsQuery),
    in: vi.fn(async () => ({
      data: [
        {
          order_id: 'order-1',
          name_ko: '테스트 장비',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          quantity: 1,
          unit_points: 100,
        },
      ],
      error: null,
    })),
  }
  const auditQuery = {
    select: vi.fn(() => auditQuery),
    eq: vi.fn(() => auditQuery),
    in: vi.fn(() => auditQuery),
    order: vi.fn(async () => ({
      data: [
        {
          target_id: 'order-1',
          admin_discord_id: 'admin-1',
          details: {
            requestedTotalPoints: 100,
            approvedTotalPoints: 70,
          },
          created_at: '2026-06-03T00:10:00.000Z',
        },
      ],
      error: null,
    })),
  }
  const reviewQuery = {
    select: vi.fn(() => reviewQuery),
    eq: vi.fn(() => reviewQuery),
    in: vi.fn(() => reviewQuery),
    order: vi.fn(async () => ({ data: [], error: null })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_orders') return ordersQuery
    if (table === 'shop_order_items') return itemsQuery
    if (table === 'admin_audit_log') return auditQuery
    if (table === 'shop_order_price_reviews') return reviewQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, ordersQuery, itemsQuery, auditQuery }
}

describe('listShopOrdersForMember', () => {
  it('includes admin-approved price adjustment history for the member order', async () => {
    const { db, ordersQuery, auditQuery } = createMemberOrdersDb()

    await expect(listShopOrdersForMember(db as never, 'guild-1', 'member-1')).resolves.toEqual([
      {
        id: 'order-1',
        totalPoints: 70,
        priceReviewRequired: true,
        status: 'approved',
        memberNote: null,
        adminNote: null,
        pickupNote: null,
        priceReview: null,
        priceAdjustment: {
          requestedTotalPoints: 100,
          approvedTotalPoints: 70,
          adjustedAt: '2026-06-03T00:10:00.000Z',
          adminDiscordId: null,
        },
        createdAt: '2026-06-03T00:00:00.000Z',
        resolvedAt: '2026-06-03T00:10:00.000Z',
        items: [
          {
            nameKo: '테스트 장비',
            uniqueName: 'T4_TEST_ITEM',
            enchant: 0,
            quality: 1,
            quantity: 1,
            unitPoints: 100,
          },
        ],
      },
    ])

    expect(ordersQuery.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(ordersQuery.eq).toHaveBeenCalledWith('discord_id', 'member-1')
    expect(auditQuery.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(auditQuery.eq).toHaveBeenCalledWith('action', 'shop.order.approve')
    expect(auditQuery.eq).toHaveBeenCalledWith('target_kind', 'shop_order')
    expect(auditQuery.in).toHaveBeenCalledWith('target_id', ['order-1'])
  })
})
