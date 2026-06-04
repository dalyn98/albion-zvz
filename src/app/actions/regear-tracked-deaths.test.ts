import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
  fetchTrackedBattleWindows: vi.fn(),
  equipmentToBuildSnapshot: vi.fn(),
  getRegearEligibilityDays: vi.fn(),
  requireManualRegearAllowed: vi.fn(),
  sendAdminNotification: vi.fn(),
  validateImageUploadFile: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
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

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/tracked-kills', () => ({
  fetchTrackedBattleWindows: mocks.fetchTrackedBattleWindows,
}))

vi.mock('@/lib/auto-regear', () => ({
  equipmentToBuildSnapshot: mocks.equipmentToBuildSnapshot,
}))

vi.mock('@/app/actions/regear', () => ({
  getRegearEligibilityDays: mocks.getRegearEligibilityDays,
}))

vi.mock('@/lib/albion-identity', () => ({
  requireManualRegearAllowed: mocks.requireManualRegearAllowed,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('@/lib/image-upload', () => ({
  validateImageUploadFile: mocks.validateImageUploadFile,
}))

import { submitTrackedAdHocRegear } from './regear-tracked-deaths'

function formData(input: { killboardEventId: string; claimedSilver: string }): FormData {
  const form = new FormData()
  form.set('killboardEventId', input.killboardEventId)
  form.set('roleName', 'DPS')
  form.set('claimedSilver', input.claimedSilver)
  return form
}

describe('submitTrackedAdHocRegear input parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member One',
      isMember: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAppSetting.mockResolvedValue('false')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn() })
  })

  it('rejects fractional killboard ids before querying killboard rows', async () => {
    await expect(
      submitTrackedAdHocRegear(formData({ killboardEventId: '123.9', claimedSilver: '1000' })),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(mocks.getAdminClient().from).not.toHaveBeenCalled()
  })

  it('rejects scientific notation claim amounts before querying killboard rows', async () => {
    await expect(
      submitTrackedAdHocRegear(formData({ killboardEventId: '123', claimedSilver: '1e5' })),
    ).resolves.toEqual({ error: 'invalidClaimAmount' })

    expect(mocks.getAdminClient().from).not.toHaveBeenCalled()
  })
})
