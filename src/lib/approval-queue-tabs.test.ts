import { describe, expect, it } from 'vitest'
import { organizeApprovalQueueTabs } from './approval-queue-tabs'

const tabs = [
  { key: 'regear', badge: 21, enabled: true },
  { key: 'exchange', badge: 2, enabled: true },
  { key: 'donation', badge: 0, enabled: true },
  { key: 'shop', badge: 0, enabled: true },
  { key: 'event_payout', badge: 0, enabled: true },
  { key: 'craft', badge: 0, enabled: false },
] as const

describe('approval queue tab organization', () => {
  it('puts active work first and removes disabled empty features', () => {
    expect(organizeApprovalQueueTabs(tabs, 'regear')).toEqual({
      primary: ['regear', 'exchange'],
      secondary: ['donation', 'shop', 'event_payout'],
    })
  })

  it('keeps a selected zero-count queue visible in the primary group', () => {
    expect(organizeApprovalQueueTabs(tabs, 'shop')).toEqual({
      primary: ['regear', 'exchange', 'shop'],
      secondary: ['donation', 'event_payout'],
    })
  })

  it('retains one enabled entry point when every queue is empty', () => {
    const emptyTabs = tabs.map((tab) => ({ ...tab, badge: 0 }))
    expect(organizeApprovalQueueTabs(emptyTabs, 'regear').primary).toEqual(['regear'])
  })
})
