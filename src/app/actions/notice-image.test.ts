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

import { clearNoticeImage, uploadNoticeImage } from './notice-image'

const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

interface UploadCall {
  bucket: string
  path: string
  options: { contentType: string; upsert: boolean }
}

interface UpsertCall {
  row: Record<string, unknown>
  options: Record<string, unknown>
}

function createDb(options: { currentUrl?: string } = {}) {
  const uploadCalls: UploadCall[] = []
  const upsertCalls: UpsertCall[] = []
  const removeCalls: string[][] = []
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('app_settings')
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: options.currentUrl ? { value: options.currentUrl } : null,
          error: null,
        })),
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
        remove: vi.fn(async (paths: string[]) => {
          removeCalls.push(paths)
          return { error: null }
        }),
      })),
    },
  }
  return { db, uploadCalls, upsertCalls, removeCalls }
}

describe('notice image actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('stores uploaded notice images under the current guild prefix', async () => {
    const { db, uploadCalls, upsertCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)
    const formData = new FormData()
    formData.set('file', new File([webpBytes], 'notice.webp', { type: 'image/webp' }))

    const result = await uploadNoticeImage('regear', formData)

    expect(result.error).toBeUndefined()
    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]).toMatchObject({
      bucket: 'notice-images',
      options: { contentType: 'image/webp', upsert: false },
    })
    expect(uploadCalls[0].path).toMatch(/^guild-1\/regear-.+\.webp$/)
    expect(upsertCalls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'regear_notice_image_url',
      value: expect.stringContaining('/notice-images/guild-1/regear-'),
    })
  })

  it('rejects invalid upload targets before touching guild settings', async () => {
    const formData = new FormData()
    formData.set('file', new File(['image'], 'notice.webp', { type: 'image/webp' }))

    const result = await uploadNoticeImage('home' as never, formData)

    expect(result).toEqual({ error: 'invalidInput' })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('rejects invalid clear targets before touching guild settings', async () => {
    const result = await clearNoticeImage('../regear' as never)

    expect(result).toEqual({ error: 'invalidInput' })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('does not remove notice image storage paths outside the current guild prefix', async () => {
    const { db, removeCalls } = createDb({
      currentUrl:
        'https://storage.test/storage/v1/object/public/notice-images/guild-2/regear-old.webp',
    })
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(clearNoticeImage('regear')).resolves.toEqual({})

    expect(removeCalls).toEqual([])
  })
})
