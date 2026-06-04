import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { updateRoleReward } from './exchange-admin'

describe('updateRoleReward', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logAdminAction.mockReset()
  })

  it('rejects rewards outside postgres integer range before admin queries run', async () => {
    await expect(updateRoleReward('Dps', 2147483648)).resolves.toEqual({
      error: 'nonNegativeInteger',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.requireAdmin).not.toHaveBeenCalled()
  })
})
