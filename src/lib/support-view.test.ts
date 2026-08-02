import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPayload } from '@/lib/session-verify'

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  getImpersonationFromCookies: vi.fn(),
}))

vi.mock('@/lib/super-admin-identity', () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))
vi.mock('@/lib/super-admin-impersonation', () => ({
  getImpersonationFromCookies: mocks.getImpersonationFromCookies,
}))

import {
  assertSupportViewMutationAllowed,
  SUPPORT_VIEW_READ_ONLY_ERROR,
} from '@/lib/support-view'

const session = { discordId: 'operator-1' } as SessionPayload

beforeEach(() => {
  mocks.isSuperAdmin.mockReset().mockReturnValue(false)
  mocks.getImpersonationFromCookies.mockReset().mockResolvedValue(null)
})

describe('support-view mutation guard', () => {
  it('does not inspect support-view cookies for normal guild users', async () => {
    await expect(assertSupportViewMutationAllowed(session)).resolves.toBeUndefined()
    expect(mocks.getImpersonationFromCookies).not.toHaveBeenCalled()
  })

  it('allows a super-admin outside support view', async () => {
    mocks.isSuperAdmin.mockReturnValue(true)

    await expect(assertSupportViewMutationAllowed(session)).resolves.toBeUndefined()
  })

  it('blocks a super-admin with a valid support-view target', async () => {
    mocks.isSuperAdmin.mockReturnValue(true)
    mocks.getImpersonationFromCookies.mockResolvedValue({
      tenantId: '123e4567-e89b-42d3-a456-426614174000',
      startedAt: Date.now(),
    })

    await expect(assertSupportViewMutationAllowed(session)).rejects.toThrow(
      SUPPORT_VIEW_READ_ONLY_ERROR,
    )
  })
})
