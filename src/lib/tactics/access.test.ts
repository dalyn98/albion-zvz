import { describe, expect, it } from 'vitest'
import { canAccessAdminPath } from '@/lib/admin-route-access'
import { CAP, serializeCapabilities } from '@/lib/permissions'

describe('tactic admin route access', () => {
  it('allows tactics officers to open the tactics admin area', () => {
    expect(
      canAccessAdminPath(
        '/admin/dashboard/tactics',
        false,
        serializeCapabilities(CAP.TACTICS_MANAGE),
      ),
    ).toBe(true)
    expect(
      canAccessAdminPath(
        '/admin/dashboard/tactics/example-board',
        false,
        serializeCapabilities(CAP.TACTICS_PUBLISH),
      ),
    ).toBe(true)
  })

  it('does not let view-only tactics members into the editor', () => {
    expect(
      canAccessAdminPath(
        '/admin/dashboard/tactics',
        false,
        serializeCapabilities(CAP.TACTICS_VIEW),
      ),
    ).toBe(false)
  })
})
