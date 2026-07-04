import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { CAP } from '@/lib/permissions'
import { getDonationScreenshotUrl } from './donation-admin'

describe('donation admin actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
  })

  it('gates donation screenshot review with the donation approval capability', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://example.test/signed' },
      error: null,
    }))
    const from = vi.fn(() => ({ createSignedUrl }))
    mocks.requireAnyCapability.mockResolvedValue({ storage: { from } })

    await expect(getDonationScreenshotUrl('guild/path.png')).resolves.toEqual({
      url: 'https://example.test/signed',
    })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.DONATION_APPROVE])
    expect(from).toHaveBeenCalledWith('donation-screenshots')
  })
})
