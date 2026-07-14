import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  requireAllianceContentComplianceAvailable: vi.fn(),
  requireCapability: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/alliance-content-compliance-access', () => ({
  requireAllianceContentComplianceAvailable: mocks.requireAllianceContentComplianceAvailable,
}))

vi.mock('@/lib/auth', () => ({
  requireCapability: mocks.requireCapability,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}))

import { addAllianceContentManualParticipation } from './alliance-content-compliance'

describe('addAllianceContentManualParticipation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects malformed input before loading a session', async () => {
    await expect(addAllianceContentManualParticipation({
      sessionId: 'not-a-uuid',
      memberDiscordId: '',
    })).resolves.toEqual({ ok: false, code: 'invalidManualParticipation' })

    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('uses the current tenant and audits a successful manual addition', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.requireCapability.mockResolvedValue({ rpc })

    await expect(addAllianceContentManualParticipation({
      sessionId: '2c40a3e9-9ab4-4a58-8e3c-598a18b9db1d',
      memberDiscordId: 'member-1',
    })).resolves.toEqual({ ok: true })

    expect(mocks.requireAllianceContentComplianceAvailable).toHaveBeenCalledWith('tenant-1')
    expect(rpc).toHaveBeenCalledWith('add_alliance_content_manual_participation', {
      p_guild_id: 'tenant-1',
      p_session_id: '2c40a3e9-9ab4-4a58-8e3c-598a18b9db1d',
      p_discord_id: 'member-1',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'tenant-1',
      adminDiscordId: 'officer-1',
      action: 'alliance_content.participation.add',
      targetKind: 'alliance_content_session',
      targetDiscordId: 'member-1',
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/content-compliance')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me/content-compliance')
  })
})
