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
  reviewAllianceContentVideos,
} from './alliance-content-compliance'

const BATTLE_A = '11111111-1111-4111-8111-111111111111'
const BATTLE_B = '22222222-2222-4222-8222-222222222222'
const SUBMISSION_A = '33333333-3333-4333-8333-333333333333'
const SUBMISSION_B = '44444444-4444-4444-8444-444444444444'

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

describe('reviewAllianceContentVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
  })

  it('rejects an empty, duplicate, or oversized selection before loading a session', async () => {
    const oversizedSelection = Array.from({ length: 51 }, (_, index) =>
      `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
    )

    await expect(reviewAllianceContentVideos([], 'approve')).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'invalidReviewSelection',
    })
    await expect(reviewAllianceContentVideos([SUBMISSION_A, SUBMISSION_A], 'approve')).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'invalidReviewSelection',
    })
    await expect(reviewAllianceContentVideos(oversizedSelection, 'approve')).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'invalidReviewSelection',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('requires one bounded shared reason when rejecting selected videos', async () => {
    await expect(reviewAllianceContentVideos([SUBMISSION_A], 'reject', '   ')).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'reviewNoteRequired',
    })
    await expect(reviewAllianceContentVideos([SUBMISSION_A], 'reject', 'x'.repeat(501))).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'invalidReviewNote',
    })
    await expect(
      reviewAllianceContentVideos([SUBMISSION_A], 'archive' as 'approve'),
    ).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [],
      code: 'invalidReview',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('rechecks authentication inside the bulk server action', async () => {
    mocks.getSession.mockResolvedValue(null)

    await expect(reviewAllianceContentVideos([SUBMISSION_A], 'approve')).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [SUBMISSION_A],
      code: 'unauthorized',
    })

    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })

  it('reviews selected videos within the current tenant and audits every success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: SUBMISSION_A, error: null })
    mocks.requireCapability.mockResolvedValue({ rpc })

    await expect(
      reviewAllianceContentVideos([SUBMISSION_A, SUBMISSION_B], 'reject', '화면이 식별되지 않습니다.'),
    ).resolves.toEqual({
      ok: true,
      reviewedIds: [SUBMISSION_A, SUBMISSION_B],
      failedIds: [],
    })

    expect(mocks.requireAllianceContentComplianceAvailable).toHaveBeenCalledTimes(1)
    expect(mocks.requireAllianceContentComplianceAvailable).toHaveBeenCalledWith('tenant-1')
    expect(mocks.requireCapability).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'review_alliance_content_video', {
      p_guild_id: 'tenant-1',
      p_submission_id: SUBMISSION_A,
      p_admin_discord_id: 'officer-1',
      p_decision: 'reject',
      p_review_note: '화면이 식별되지 않습니다.',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'review_alliance_content_video', {
      p_guild_id: 'tenant-1',
      p_submission_id: SUBMISSION_B,
      p_admin_discord_id: 'officer-1',
      p_decision: 'reject',
      p_review_note: '화면이 식별되지 않습니다.',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledTimes(2)
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'tenant-1',
      adminDiscordId: 'officer-1',
      action: 'alliance_content.video.reject',
      targetId: SUBMISSION_A,
      targetKind: 'alliance_content_video_submission',
    }))
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: SUBMISSION_B,
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('returns successful and failed IDs separately so the UI can retain only failures', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: SUBMISSION_A, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'ALLIANCE_CONTENT_SUBMISSION_NOT_REVIEWABLE' },
      })
    mocks.requireCapability.mockResolvedValue({ rpc })

    await expect(
      reviewAllianceContentVideos([SUBMISSION_A, SUBMISSION_B], 'approve'),
    ).resolves.toEqual({
      ok: false,
      reviewedIds: [SUBMISSION_A],
      failedIds: [SUBMISSION_B],
      code: 'ALLIANCE_CONTENT_SUBMISSION_NOT_REVIEWABLE',
    })

    expect(mocks.logAdminAction).toHaveBeenCalledTimes(1)
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'alliance_content.video.approve',
      targetId: SUBMISSION_A,
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('keeps every selection when all review calls fail unexpectedly', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network failure'))
    mocks.requireCapability.mockResolvedValue({ rpc })

    await expect(
      reviewAllianceContentVideos([SUBMISSION_A, SUBMISSION_B], 'approve'),
    ).resolves.toEqual({
      ok: false,
      reviewedIds: [],
      failedIds: [SUBMISSION_A, SUBMISSION_B],
      code: 'requestFailed',
    })

    expect(mocks.logAdminAction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
