import { describe, expect, it } from 'vitest'
import {
  isMobileNavigationItemActive,
  resolveMobilePrimaryNavigation,
} from './app-navigation'

describe('mobile primary navigation', () => {
  it('prioritizes the five recurring member actions on member routes', () => {
    const items = resolveMobilePrimaryNavigation({
      pathname: '/regear',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: true,
        events: true,
        approvals: true,
      },
    })

    expect(items.map((item) => item.key)).toEqual([
      'today',
      'events',
      'regear',
      'wallet',
      'more',
    ])
  })

  it('switches to the admin task queue only while operating in admin routes', () => {
    const items = resolveMobilePrimaryNavigation({
      pathname: '/admin/dashboard/approvals?tab=regear',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: true,
        events: true,
        approvals: true,
      },
    })

    expect(items.map((item) => item.key)).toEqual([
      'operations',
      'adminEvents',
      'approvals',
      'memberToday',
      'more',
    ])
  })

  it('never exposes member-only or unauthorized admin destinations', () => {
    const guestItems = resolveMobilePrimaryNavigation({
      pathname: '/',
      canSeeAdminNav: false,
      isMember: false,
      isLocalGuildAccount: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    })
    expect(guestItems.map((item) => item.key)).toEqual(['today', 'events', 'more'])

    const restrictedAdminItems = resolveMobilePrimaryNavigation({
      pathname: '/admin/dashboard',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: true,
        events: false,
        approvals: true,
      },
    })
    expect(restrictedAdminItems.map((item) => item.key)).toEqual([
      'operations',
      'approvals',
      'memberToday',
      'more',
    ])
  })

  it('keeps root matching exact and child workspaces active', () => {
    const [today, events] = resolveMobilePrimaryNavigation({
      pathname: '/',
      canSeeAdminNav: false,
      isMember: true,
      isLocalGuildAccount: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    })

    expect(isMobileNavigationItemActive('/', today)).toBe(true)
    expect(isMobileNavigationItemActive('/events/event-1', today)).toBe(false)
    expect(isMobileNavigationItemActive('/events/event-1', events)).toBe(true)
  })
})
