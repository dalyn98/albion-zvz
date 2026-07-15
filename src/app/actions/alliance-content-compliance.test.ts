import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  requireAllianceContentComplianceAvailable: vi.fn(),
  requireCapability: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  getAllianceContentAdminDashboard: vi.fn(),
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

vi.mock('@/lib/alliance-content-compliance-data', () => ({
  getAllianceContentAdminDashboard: mocks.getAllianceContentAdminDashboard,
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

import {
  addAllianceContentManualParticipation,
  confirmAllianceContentSession,
  excludeAllianceContentBattles,
} from './alliance-content-compliance'

const BATTLE_A = '11111111-1111-4111-8111-111111111111'
const BATTLE_B = '22222222-2222-4222-8222-222222222222'

function makeBattleIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
  )
}

describe('confirmAllianceContentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
  })

  it('rejects a battle selection with no participant-backed pending candidate', async () => {
    const rpc = vi.fn()
    mocks.requireCapability.mockResolvedValue({ rpc })
    mocks.getAllianceContentAdminDashboard.mockResolvedValue({ candidates: [] })

    await expect(confirmAllianceContentSession([BATTLE_A])).resolves.toEqual({
      ok: false,
      code: 'invalidBattleSelection',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('confirms the matching participant-backed candidate regardless of ID order', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'session-1', error: null })
    mocks.requireCapability.mockResolvedValue({ rpc })
    mocks.getAllianceContentAdminDashboard.mockResolvedValue({
      candidates: [{ battleRecordIds: [BATTLE_A, BATTLE_B] }],
    })

    await expect(confirmAllianceContentSession([BATTLE_B, BATTLE_A])).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('confirm_alliance_content_session', {
      p_guild_id: 'tenant-1',
      p_battle_record_ids: [BATTLE_B, BATTLE_A],
      p_admin_discord_id: 'officer-1',
    })
  })
})

describe('excludeAllianceContentBattles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
  })

  it('excludes logs from multiple selected sessions in one bounded request', async () => {
    const battleRecordIds = makeBattleIds(101)
    const eligibleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation((_column: string, selectedIds: string[]) => Promise.resolve({
        data: selectedIds.map((battleRecordId) => ({ battle_record_id: battleRecordId })),
        error: null,
      })),
    }
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'tenant_zvz_battle_records') return eligibleQuery
      if (table === 'alliance_content_excluded_battles') return { upsert }
      throw new Error(`Unexpected table: ${table}`)
    })
    mocks.requireCapability.mockResolvedValue({ from })

    await expect(excludeAllianceContentBattles(battleRecordIds)).resolves.toEqual({ ok: true })

    expect(eligibleQuery.eq).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(eligibleQuery.in).toHaveBeenNthCalledWith(
      1,
      'battle_record_id',
      battleRecordIds.slice(0, 100),
    )
    expect(eligibleQuery.in).toHaveBeenNthCalledWith(
      2,
      'battle_record_id',
      battleRecordIds.slice(100),
    )
    expect(upsert).toHaveBeenCalledWith(
      battleRecordIds.map((battleRecordId) => ({
        guild_id: 'tenant-1',
        battle_record_id: battleRecordId,
        excluded_by_discord_id: 'officer-1',
      })),
      { onConflict: 'guild_id,battle_record_id' },
    )
  })

  it('rejects an unbounded bulk exclusion before loading a session', async () => {
    await expect(excludeAllianceContentBattles(makeBattleIds(501))).resolves.toEqual({
      ok: false,
      code: 'invalidBattleSelection',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('rejects a non-array selection without throwing', async () => {
    const excludeWithUnknownInput = excludeAllianceContentBattles as unknown as (
      battleRecordIds: unknown,
    ) => Promise<{ ok: boolean; code?: string }>

    await expect(excludeWithUnknownInput(null)).resolves.toEqual({
      ok: false,
      code: 'invalidBattleSelection',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
  })
})

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
