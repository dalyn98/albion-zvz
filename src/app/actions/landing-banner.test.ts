import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { uploadLandingBanner } from './landing-banner'

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

interface UploadCall {
  bucket: string
  path: string
  options: { contentType: string; upsert: boolean }
}

interface UpsertCall {
  row: Record<string, unknown>
  options: Record<string, unknown>
}

function createDb() {
  const uploadCalls: UploadCall[] = []
  const upsertCalls: UpsertCall[] = []
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('app_settings')
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        upsert: vi.fn(async (row: Record<string, unknown>, options: Record<string, unknown>) => {
          upsertCalls.push({ row, options })
          return { error: null }
        }),
      }
      return query
    }),
    storage: {
      from: vi.fn((bucket: string) => ({
        upload: vi.fn(async (
          path: string,
          _file: File,
          options: { contentType: string; upsert: boolean },
        ) => {
          uploadCalls.push({ bucket, path, options })
          return { error: null }
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: {
            publicUrl: `https://storage.test/storage/v1/object/public/${bucket}/${path}`,
          },
        })),
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
  }
  return { db, uploadCalls, upsertCalls }
}

describe('landing banner actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('stores uploaded banners under the current guild prefix', async () => {
    const { db, uploadCalls, upsertCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)
    const formData = new FormData()
    formData.set('file', new File([pngBytes], 'banner.png', { type: 'image/png' }))

    const result = await uploadLandingBanner(formData)

    expect(result.error).toBeUndefined()
    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GUILD_PROFILE])
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]).toMatchObject({
      bucket: 'landing-banners',
      options: { contentType: 'image/png', upsert: false },
    })
    expect(uploadCalls[0].path).toMatch(/^guild-1\/banner-.+\.png$/)
    expect(upsertCalls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'landing_banner_url',
      value: expect.stringContaining('/landing-banners/guild-1/banner-'),
    })
  })
})
