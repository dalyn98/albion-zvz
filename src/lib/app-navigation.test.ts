import { describe, expect, it } from 'vitest'
import {
  groupNavigationByArea,
  parseNavigationVisitMemory,
  resolveContextualAreaDestinations,
  searchNavigationItems,
  updateNavigationVisitMemory,
} from './app-navigation'

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

describe('contextual area destinations', () => {
  const groups = groupNavigationByArea(
    [
      { href: '/', label: '길드 홈', exact: true },
      { href: '/events', label: '이벤트' },
      { href: '/regear', label: '리기어 요청' },
      { href: '/leaderboard', label: '리더보드' },
      { href: '/members', label: '길드원' },
    ],
    [
      { href: '/admin/dashboard', label: '관리자 상황판', exact: true },
      { href: '/admin/dashboard/events', label: '이벤트 관리' },
      { href: '/admin/dashboard/approvals', label: '승인 대기', badge: 7 },
      { href: '/admin/dashboard/stats', label: '길드 통계' },
      { href: '/admin/dashboard/guild-profile', label: '길드 프로필' },
    ],
  )

  it('keeps operator context across all five stable areas', () => {
    const destinations = resolveContextualAreaDestinations({
      currentHref: '/admin/dashboard/events/event-1',
      groups,
      fallbackAudience: 'member',
    })

    expect(destinations.map(({ area, audience, href }) => ({ area, audience, href }))).toEqual([
      { area: 'today', audience: 'operator', href: '/admin/dashboard' },
      { area: 'operations', audience: 'operator', href: '/admin/dashboard/events/event-1' },
      { area: 'supply', audience: 'operator', href: '/admin/dashboard/approvals' },
      { area: 'records', audience: 'operator', href: '/admin/dashboard/stats' },
      { area: 'guild', audience: 'operator', href: '/admin/dashboard/guild-profile' },
    ])
  })

  it('keeps member context even when operator tools are available', () => {
    const destinations = resolveContextualAreaDestinations({
      currentHref: '/events/event-1',
      groups,
      fallbackAudience: 'operator',
    })

    expect(destinations.find((item) => item.area === 'supply')).toMatchObject({
      audience: 'member',
      href: '/regear',
      destinationLabel: '리기어 요청',
    })
  })

  it('restores only authorized visits and falls back when access disappeared', () => {
    const memory = parseNavigationVisitMemory({
      version: 1,
      visits: {
        operator: {
          supply: '/admin/dashboard/shop',
          records: '/admin/dashboard/removed-report',
        },
      },
      recent: ['/admin/dashboard/shop', '/admin/dashboard/removed-report'],
    }, groups)

    const destinations = resolveContextualAreaDestinations({
      currentHref: '/admin/dashboard/events',
      groups,
      visits: memory,
      fallbackAudience: 'member',
    })

    expect(memory.recent).toEqual([])
    expect(destinations.find((item) => item.area === 'supply')?.href).toBe(
      '/admin/dashboard/approvals',
    )
    expect(destinations.find((item) => item.area === 'records')?.href).toBe(
      '/admin/dashboard/stats',
    )
  })

  it('falls back to the other audience only when the current audience has no tool', () => {
    const limitedGroups = groupNavigationByArea(
      [
        { href: '/', label: '길드 홈', exact: true },
        { href: '/members', label: '길드원' },
      ],
      [{ href: '/admin/dashboard/events', label: '이벤트 관리' }],
    )

    const destinations = resolveContextualAreaDestinations({
      currentHref: '/admin/dashboard/events',
      groups: limitedGroups,
      fallbackAudience: 'member',
    })

    expect(destinations.map(({ area, audience, href }) => ({ area, audience, href }))).toEqual([
      { area: 'today', audience: 'member', href: '/' },
      { area: 'operations', audience: 'operator', href: '/admin/dashboard/events' },
      { area: 'guild', audience: 'member', href: '/members' },
    ])
  })

  it('normalizes detail routes to stable catalog entries before storing them', () => {
    const memory = updateNavigationVisitMemory({
      currentHref: '/admin/dashboard/events/event-1?section=roster',
      groups,
      previous: { version: 1, visits: {}, recent: [] },
      fallbackAudience: 'member',
    })

    expect(memory.visits.operator?.operations).toBe('/admin/dashboard/events')
    expect(memory.recent).toEqual(['/admin/dashboard/events'])
  })

  it('keeps an event-scoped restricted session inside its only authorized area', () => {
    const restrictedGroups = groupNavigationByArea(
      [{ href: '/events/event-1', label: '현재 이벤트' }],
      [],
    )

    const destinations = resolveContextualAreaDestinations({
      currentHref: '/events/event-1?tab=roster',
      groups: restrictedGroups,
      fallbackAudience: 'member',
    })

    expect(destinations).toEqual([expect.objectContaining({
      area: 'operations',
      audience: 'member',
      href: '/events/event-1?tab=roster',
      active: true,
    })])
  })

  it('uses query context to distinguish member and operator views of a shared demo route', () => {
    const sharedRouteGroups = groupNavigationByArea(
      [{ href: '/demo/shop?audience=member', label: '길드 상점', exact: true }],
      [{ href: '/demo/shop?audience=operator', label: '상점 관리', exact: true }],
    )

    const destinations = resolveContextualAreaDestinations({
      currentHref: '/demo/shop?audience=member',
      groups: sharedRouteGroups,
      fallbackAudience: 'operator',
    })

    expect(destinations[0]).toMatchObject({
      audience: 'member',
      destinationLabel: '길드 상점',
    })
  })
})
