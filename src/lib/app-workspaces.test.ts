import { describe, expect, it } from 'vitest'
import {
  isMemberEventsWorkspace,
  resolveAdminEventWorkspaceSection,
  resolveAdminShopView,
} from './app-workspaces'

describe('app workspaces', () => {
  it('keeps the member Today route separate from the full event index', () => {
    expect(isMemberEventsWorkspace('/')).toBe(false)
    expect(isMemberEventsWorkspace('/events')).toBe(true)
    expect(isMemberEventsWorkspace('/events/event-1')).toBe(false)
    expect(isMemberEventsWorkspace(null)).toBe(false)
  })

  it('falls back unknown admin event workspace sections to the event list', () => {
    expect(resolveAdminEventWorkspaceSection(undefined)).toBe('events')
    expect(resolveAdminEventWorkspaceSection('events')).toBe('events')
    expect(resolveAdminEventWorkspaceSection('templates')).toBe('templates')
    expect(resolveAdminEventWorkspaceSection('unknown')).toBe('events')
  })

  it('keeps the shop overview light and opens one operational view at a time', () => {
    expect(resolveAdminShopView(undefined)).toBe('overview')
    expect(resolveAdminShopView('sync')).toBe('sync')
    expect(resolveAdminShopView('catalog')).toBe('catalog')
    expect(resolveAdminShopView('settings')).toBe('settings')
    expect(resolveAdminShopView('orders')).toBe('overview')
  })
})
