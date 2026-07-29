import { describe, expect, it } from 'vitest'
import { APP_AREA_DESCRIPTORS, resolveAppArea } from './app-route-registry'

describe('app route registry', () => {
  it('defines one stable destination for every operating area', () => {
    expect(APP_AREA_DESCRIPTORS.map((item) => item.key)).toEqual([
      'today',
      'operations',
      'supply',
      'records',
      'guild',
    ])
    expect(new Set(APP_AREA_DESCRIPTORS.map((item) => item.href)).size).toBe(5)
  })

  it.each([
    ['/', 'today'],
    ['/admin/dashboard', 'today'],
    ['/me', 'today'],
    ['/demo/me', 'today'],
    ['/events/evt-1', 'operations'],
    ['/admin/dashboard/events/evt-1', 'operations'],
    ['/regear', 'supply'],
    ['/me/wallet', 'supply'],
    ['/me/requests', 'supply'],
    ['/me/regear/claim-1', 'supply'],
    ['/admin/dashboard/approvals?tab=regear', 'supply'],
    ['/battles/42', 'records'],
    ['/admin/dashboard/stats', 'records'],
    ['/me/content-compliance', 'records'],
    ['/me/activity/guild-1', 'records'],
    ['/events/evt-1/report', 'records'],
    ['/demo/events/evt-1/report', 'records'],
    ['/members/discord-id', 'guild'],
    ['/admin/dashboard/members/discord-id', 'guild'],
    ['/admin/dashboard/permissions', 'guild'],
    ['/demo/member-events', 'operations'],
    ['/admin/dashboard/templates/template-1', 'operations'],
    ['/demo/regear', 'supply'],
    ['/demo/leaderboard', 'records'],
    ['/demo/guide', 'guild'],
    ['/demo/me/profile', 'guild'],
  ] as const)('maps %s to %s', (pathname, area) => {
    expect(resolveAppArea(pathname)).toBe(area)
  })
})
