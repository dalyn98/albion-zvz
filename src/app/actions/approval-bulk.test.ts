import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  sessionHasAny: vi.fn(),
  listDonationRequests: vi.fn(),
  approveDonationRequest: vi.fn(),
  listEventPayoutRequests: vi.fn(),
  approveEventPayoutRequest: vi.fn(),
  listCraftOrderTasksForReview: vi.fn(),
  approveCraftOrderTaskAdmin: vi.fn(),
  listRegearRequests: vi.fn(),
  approveRegearRequest: vi.fn(),
  listExchangeRequests: vi.fn(),
  approveExchangeRequest: vi.fn(),
  listShopOrders: vi.fn(),
  approveShopOrder: vi.fn(),
  isRegearSupported: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHasAny: mocks.sessionHasAny,
}))
vi.mock('@/lib/tenant', () => ({ getSessionGuildId: mocks.getSessionGuildId }))
vi.mock('@/lib/regear-support-server', () => ({
  isRegearSupported: mocks.isRegearSupported,
}))
vi.mock('@/lib/public-action-error', () => ({
  publicActionError: vi.fn(async () => 'unexpected'),
}))
vi.mock('@/app/actions/donation-admin', () => ({
  listDonationRequests: mocks.listDonationRequests,
  approveDonationRequest: mocks.approveDonationRequest,
}))
vi.mock('@/app/actions/event-payout-admin', () => ({
  listEventPayoutRequests: mocks.listEventPayoutRequests,
  approveEventPayoutRequest: mocks.approveEventPayoutRequest,
}))
vi.mock('@/app/actions/craft-orders', () => ({
  listCraftOrderTasksForReview: mocks.listCraftOrderTasksForReview,
  approveCraftOrderTaskAdmin: mocks.approveCraftOrderTaskAdmin,
}))
vi.mock('@/app/actions/regear-admin', () => ({
  listRegearRequests: mocks.listRegearRequests,
  approveRegearRequest: mocks.approveRegearRequest,
}))
vi.mock('@/app/actions/exchange-admin', () => ({
  listExchangeRequests: mocks.listExchangeRequests,
  approveExchangeRequest: mocks.approveExchangeRequest,
}))
vi.mock('@/app/actions/shop-admin', () => ({
  listShopOrders: mocks.listShopOrders,
  approveShopOrder: mocks.approveShopOrder,
}))

import { approveAllPendingRequests } from './approval-bulk'

describe('approveAllPendingRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.sessionHasAny.mockReturnValue(true)
    mocks.isRegearSupported.mockResolvedValue(true)
    mocks.listDonationRequests.mockResolvedValue({ requests: [] })
    mocks.listEventPayoutRequests.mockResolvedValue({ requests: [] })
    mocks.listCraftOrderTasksForReview.mockResolvedValue({ tasks: [] })
    mocks.listRegearRequests.mockResolvedValue({ requests: [] })
    mocks.listExchangeRequests.mockResolvedValue({ requests: [] })
    mocks.listShopOrders.mockResolvedValue({ orders: [] })
    mocks.approveDonationRequest.mockResolvedValue({})
    mocks.approveEventPayoutRequest.mockResolvedValue({})
    mocks.approveCraftOrderTaskAdmin.mockResolvedValue({})
    mocks.approveRegearRequest.mockResolvedValue({})
    mocks.approveExchangeRequest.mockResolvedValue({})
    mocks.approveShopOrder.mockResolvedValue({})
  })

  it('rejects an unauthenticated bulk mutation', async () => {
    mocks.getSession.mockResolvedValue(null)

    await expect(approveAllPendingRequests()).resolves.toMatchObject({
      succeeded: 0,
      fatalError: 'unauthorized',
    })
    expect(mocks.listDonationRequests).not.toHaveBeenCalled()
  })

  it('does not query queues outside the caller capabilities', async () => {
    mocks.sessionHasAny.mockReturnValue(false)

    await expect(approveAllPendingRequests()).resolves.toMatchObject({
      total: 0,
      succeeded: 0,
    })
    expect(mocks.listDonationRequests).not.toHaveBeenCalled()
    expect(mocks.listShopOrders).not.toHaveBeenCalled()
  })

  it('runs credit queues before debits and skips unsafe rows', async () => {
    const order: string[] = []
    mocks.listDonationRequests.mockResolvedValue({ requests: [{ id: 'donation-1' }] })
    mocks.listEventPayoutRequests.mockResolvedValue({ requests: [{ id: 'payout-1' }] })
    mocks.listCraftOrderTasksForReview.mockResolvedValue({ tasks: [{ taskId: 'craft-1' }] })
    mocks.listRegearRequests.mockResolvedValue({
      requests: [
        { id: 'regear-1', participant_confirmation_status: 'confirmed' },
        { id: 'regear-2', participant_confirmation_status: 'awaiting_closeout' },
      ],
    })
    mocks.listExchangeRequests.mockResolvedValue({
      requests: [
        { id: 'exchange-1', balance: 500, silver: 400 },
        { id: 'exchange-2', balance: 100, silver: 400 },
      ],
    })
    mocks.listShopOrders.mockResolvedValue({
      orders: [
        {
          id: 'shop-1',
          balance: 500,
          totalPoints: 200,
          stockReservedAt: null,
          items: [{ stockAvailable: 2, quantity: 1 }],
        },
        {
          id: 'shop-2',
          balance: 500,
          totalPoints: 200,
          stockReservedAt: null,
          items: [{ stockAvailable: 0, quantity: 1 }],
        },
      ],
    })
    mocks.approveDonationRequest.mockImplementation(async () => {
      order.push('donation')
      return {}
    })
    mocks.approveEventPayoutRequest.mockImplementation(async () => {
      order.push('event_payout')
      return {}
    })
    mocks.approveCraftOrderTaskAdmin.mockImplementation(async () => {
      order.push('craft')
      return {}
    })
    mocks.approveRegearRequest.mockImplementation(async () => {
      order.push('regear')
      return {}
    })
    mocks.approveExchangeRequest.mockImplementation(async () => {
      order.push('exchange')
      return {}
    })
    mocks.approveShopOrder.mockImplementation(async () => {
      order.push('shop')
      return {}
    })

    const result = await approveAllPendingRequests()

    expect(order).toEqual(['donation', 'event_payout', 'craft', 'regear', 'exchange', 'shop'])
    expect(result).toMatchObject({ total: 9, succeeded: 6, failed: 0, skipped: 3 })
    expect(mocks.getSessionGuildId).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/approvals')
  })

  it('keeps processing after an individual approval fails', async () => {
    mocks.listDonationRequests.mockResolvedValue({
      requests: [{ id: 'donation-1' }, { id: 'donation-2' }],
    })
    mocks.approveDonationRequest
      .mockResolvedValueOnce({ error: 'already handled' })
      .mockResolvedValueOnce({})

    const result = await approveAllPendingRequests()

    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1, skipped: 0 })
    expect(result.queues[0]).toMatchObject({
      key: 'donation',
      error: 'already handled',
    })
  })
})
