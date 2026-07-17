import { describe, expect, it } from 'vitest'
import {
  isMobileNavigationItemActive,
  resolveMobilePrimaryNavigation,
} from './app-navigation'

describe('mobile primary navigation', () => {
  it('keeps the five operating areas stable on member routes', () => {
    const items = resolveMobilePrimaryNavigation({
      pathname: '/regear',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      eventNavigationOnly: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: true,
        events: true,
        approvals: true,
      },
    })

    expect(items.map((item) => item.key)).toEqual([
      'today',
      'operations',
      'supply',
      'records',
      'guild',
    ])
  })

  it('does not replace the mental model on admin routes', () => {
    const items = resolveMobilePrimaryNavigation({
      pathname: '/admin/dashboard/approvals?tab=regear',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      eventNavigationOnly: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: true,
        events: true,
        approvals: true,
      },
    })

    expect(items.map((item) => item.key)).toEqual([
      'today',
      'operations',
      'supply',
      'records',
      'guild',
    ])
  })

  it('uses a public supply destination for guests and limits onboarding-only sessions', () => {
    const guestItems = resolveMobilePrimaryNavigation({
      pathname: '/',
      canSeeAdminNav: false,
      isMember: false,
      isLocalGuildAccount: false,
      eventNavigationOnly: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    })
    expect(guestItems.map((item) => item.key)).toEqual([
      'today',
      'operations',
      'supply',
      'records',
      'guild',
    ])
    expect(guestItems.find((item) => item.key === 'supply')?.href).toBe('/shop')

    const restrictedAdminItems = resolveMobilePrimaryNavigation({
      pathname: '/admin/dashboard',
      canSeeAdminNav: true,
      isMember: true,
      isLocalGuildAccount: false,
      eventNavigationOnly: false,
      memberNavigationVisible: false,
      adminAccess: {
        operations: true,
        events: false,
        approvals: true,
      },
    })
    expect(restrictedAdminItems).toEqual([{
      key: 'guild',
      labelKey: 'guild',
      href: '/onboarding/albion',
    }])
  })

  it('removes destinations blocked for restricted sessions', () => {
    const base = {
      pathname: '/',
      canSeeAdminNav: false,
      isMember: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    }
    const localItems = resolveMobilePrimaryNavigation({
      ...base,
      isLocalGuildAccount: true,
      eventNavigationOnly: false,
    })
    expect(localItems.map((item) => item.key)).toEqual(['today', 'operations', 'supply'])

    const eventOnlyItems = resolveMobilePrimaryNavigation({
      ...base,
      isLocalGuildAccount: false,
      eventNavigationOnly: true,
    })
    expect(eventOnlyItems.map((item) => item.key)).toEqual(['today', 'operations'])
  })

  it('keeps root matching exact and child workspaces active', () => {
    const [today, operations] = resolveMobilePrimaryNavigation({
      pathname: '/',
      canSeeAdminNav: false,
      isMember: true,
      isLocalGuildAccount: false,
      eventNavigationOnly: false,
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    })

    expect(isMobileNavigationItemActive('/', today)).toBe(true)
    expect(isMobileNavigationItemActive('/events/event-1', today)).toBe(false)
    expect(isMobileNavigationItemActive('/events/event-1', operations)).toBe(true)
  })
})
