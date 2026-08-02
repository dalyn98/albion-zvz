import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  requireAlbionVerified: vi.fn(),
  validateImageUploadFile: vi.fn(),
  revalidatePath: vi.fn(),
  sendAdminNotification: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/auth', () => ({
  requireCurrentMutationSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/albion-identity', () => ({
  requireAlbionVerified: mocks.requireAlbionVerified,
}))

vi.mock('@/lib/image-upload', () => ({
  validateImageUploadFile: mocks.validateImageUploadFile,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { requestDonation } from './donation'

describe('requestDonation', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.requireAlbionVerified.mockReset()
    mocks.validateImageUploadFile.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.sendAdminNotification.mockReset()

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isMember: true,
      isLocalGuildAccount: false,
    })
  })

  it('rejects amounts outside postgres integer range before file or identity checks run', async () => {
    const formData = new FormData()
    formData.set('silver', '2,147,483,648')
    formData.set('memo', '')
    formData.set('screenshot', new File(['fake'], 'proof.png', { type: 'image/png' }))

    await expect(requestDonation(formData)).resolves.toEqual({
      error: 'donationInvalidAmount',
    })

    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.requireAlbionVerified).not.toHaveBeenCalled()
    expect(mocks.validateImageUploadFile).not.toHaveBeenCalled()
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects non-decimal amount notation before file or identity checks run', async () => {
    const formData = new FormData()
    formData.set('silver', '1e3')
    formData.set('memo', '')
    formData.set('screenshot', new File(['fake'], 'proof.png', { type: 'image/png' }))

    await expect(requestDonation(formData)).resolves.toEqual({
      error: 'donationInvalidAmount',
    })

    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.requireAlbionVerified).not.toHaveBeenCalled()
    expect(mocks.validateImageUploadFile).not.toHaveBeenCalled()
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })
})
