import { describe, expect, it } from 'vitest'
import {
  groupNavigationByArea,
  isMobileNavigationItemActive,
  resolveMobilePrimaryNavigation,
  searchNavigationItems,
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

  it('keeps an event-scoped guest on the one event they can access', () => {
    const items = resolveMobilePrimaryNavigation({
      pathname: '/events/event-1',
      canSeeAdminNav: false,
      isMember: false,
      isLocalGuildAccount: false,
      eventNavigationOnly: true,
      eventScope: 'event-1',
      memberNavigationVisible: true,
      adminAccess: {
        operations: false,
        events: false,
        approvals: false,
      },
    })

    expect(items).toEqual([{
      key: 'operations',
      labelKey: 'operations',
      href: '/events/event-1',
    }])
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

describe('navigation discovery', () => {
  it('keeps every accessible operating area discoverable regardless of the current route', () => {
    const memberItems = [
      { href: '/', label: '오늘' },
      { href: '/events', label: '이벤트' },
      { href: '/regear', label: '리기어 요청' },
      { href: '/leaderboard', label: '리더보드' },
      { href: '/members', label: '길드원' },
    ]
    const operatorItems = [
      { href: '/admin/dashboard/approvals', label: '승인 대기', badge: 7 },
      { href: '/admin/dashboard/permissions', label: '권한 관리' },
    ]

    const groups = groupNavigationByArea(memberItems, operatorItems)

    expect(groups.map((group) => group.area)).toEqual([
      'today',
      'operations',
      'supply',
      'records',
      'guild',
    ])
    expect(groups.find((group) => group.area === 'supply')).toMatchObject({
      badge: 7,
      memberItems: [{ href: '/regear' }],
      operatorItems: [{ href: '/admin/dashboard/approvals' }],
    })
  })

  it('omits inaccessible areas and never invents restricted links', () => {
    const groups = groupNavigationByArea(
      [{ href: '/events/event-1', label: '현재 이벤트' }],
      [],
    )

    expect(groups).toEqual([{
      area: 'operations',
      badge: 0,
      memberItems: [{ href: '/events/event-1', label: '현재 이벤트' }],
      operatorItems: [],
    }])
  })

  it('searches only the allowed local catalog by translated label, path, and aliases', () => {
    const allowedItems = [
      {
        href: '/admin/dashboard/inventory',
        label: '재고 관리',
        areaLabel: '보급',
        audienceLabel: '길드 운영',
        aliases: '창고 인벤토리',
      },
      {
        href: '/me/settings',
        label: '내 설정',
        areaLabel: '길드',
        audienceLabel: '내 작업',
      },
    ]

    expect(searchNavigationItems(allowedItems, '창고')).toEqual([allowedItems[0]])
    expect(searchNavigationItems(allowedItems, '길드 설정')).toEqual([allowedItems[1]])
    expect(searchNavigationItems(allowedItems, 'permissions')).toEqual([])
  })
})
