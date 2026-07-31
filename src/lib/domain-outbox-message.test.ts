import { describe, expect, it } from 'vitest'
import { buildDomainMemberDm } from './domain-outbox-message'

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key

describe('domain outbox member messages', () => {
  it('renders custody-aware pickup and box movement messages', () => {
    expect(buildDomainMemberDm({
      topic: 'craft.ready_for_pickup',
      payload: { eventTitle: 'CTA', boxNumber: 14, crafterUsername: 'Crafter' },
      deliveryNonce: '101',
      t,
    })).toEqual({
      title: 'craftDeliveredTitle',
      body: 'craftDeliveredBody:{"event":"CTA","box":14,"crafter":"Crafter"}',
      url: '/craft/my-tasks',
      deliveryNonce: '101',
    })

    expect(buildDomainMemberDm({
      topic: 'craft.box_moved',
      payload: { oldBoxNumber: 14, newBoxNumber: 22 },
      deliveryNonce: '102',
      t,
    })?.body).toBe('craftBoxMovedBody:{"oldBox":14,"newBox":22}')
  })

  it('renders return, overdue, and settlement facts without inventing penalties', () => {
    expect(buildDomainMemberDm({
      topic: 'craft.unclaimed_returned',
      payload: {},
      deliveryNonce: '103',
      t,
    })?.body).toBe('craftUnclaimedReturnedBody')
    expect(buildDomainMemberDm({
      topic: 'craft.pickup_overdue',
      payload: {},
      deliveryNonce: '104',
      t,
    })?.body).toBe('craftPickupOverdueBody')
    expect(buildDomainMemberDm({
      topic: 'craft.settlement_paid',
      payload: { itemCount: 2, totalSilver: 123456 },
      deliveryNonce: '105',
      t,
    })?.body).toBe('craftSettlementPaidBody:{"count":2,"silver":"123,456"}')
  })

  it('does not send an unknown domain topic', () => {
    expect(buildDomainMemberDm({
      topic: 'unknown',
      payload: {},
      deliveryNonce: '106',
      t,
    })).toBeNull()
  })
})
