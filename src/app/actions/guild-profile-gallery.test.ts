import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
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
  revalidateTag: mocks.revalidateTag,
  updateTag: mocks.updateTag,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { moveGalleryItem, removeGalleryItem } from './guild-profile-gallery'

interface QueryCall {
  method: string
  args: unknown[]
}

interface QueryResult {
  data?: unknown
  error?: { message: string } | null
}

function createQuery(result: QueryResult, calls: QueryCall[] = []) {
  const query = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    update(payload: Record<string, unknown>) {
      calls.push({ method: 'update', args: [payload] })
      return query
    },
    delete() {
      calls.push({ method: 'delete', args: [] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push({ method: 'order', args: [column, options] })
      return query
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve(result)
    },
    then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function createDb(queries: ReturnType<typeof createQuery>[]) {
  const removeCalls: string[][] = []
  return {
    db: {
      from: vi.fn(() => {
        const query = queries.shift()
        if (!query) throw new Error('unexpected query')
        return query
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (paths: string[]) => {
            removeCalls.push(paths)
            return { error: null }
          }),
        })),
      },
    },
    removeCalls,
  }
}

describe('guild profile gallery actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('keeps tenant scope on every move update', async () => {
    const listCalls: QueryCall[] = []
    const firstUpdateCalls: QueryCall[] = []
    const secondUpdateCalls: QueryCall[] = []
    const { db } = createDb([
      createQuery(
        {
          data: [
            { id: 'gallery-a', position: 0 },
            { id: 'gallery-b', position: 1 },
          ],
          error: null,
        },
        listCalls,
      ),
      createQuery({ error: null }, firstUpdateCalls),
      createQuery({ error: null }, secondUpdateCalls),
    ])
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(moveGalleryItem('gallery-b', 'up')).resolves.toEqual({})

    expect(listCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(firstUpdateCalls).toContainEqual({ method: 'eq', args: ['id', 'gallery-b'] })
    expect(firstUpdateCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(secondUpdateCalls).toContainEqual({ method: 'eq', args: ['id', 'gallery-a'] })
    expect(secondUpdateCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
  })

  it('keeps tenant scope when compacting positions after delete', async () => {
    const lookupCalls: QueryCall[] = []
    const deleteCalls: QueryCall[] = []
    const remainingCalls: QueryCall[] = []
    const firstUpdateCalls: QueryCall[] = []
    const secondUpdateCalls: QueryCall[] = []
    const { db } = createDb([
      createQuery({ data: { id: 'gallery-b', image_url: '' }, error: null }, lookupCalls),
      createQuery({ error: null }, deleteCalls),
      createQuery(
        {
          data: [
            { id: 'gallery-a' },
            { id: 'gallery-c' },
          ],
          error: null,
        },
        remainingCalls,
      ),
      createQuery({ error: null }, firstUpdateCalls),
      createQuery({ error: null }, secondUpdateCalls),
    ])
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(removeGalleryItem('gallery-b')).resolves.toEqual({})

    expect(lookupCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(deleteCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(remainingCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(firstUpdateCalls).toContainEqual({ method: 'eq', args: ['id', 'gallery-a'] })
    expect(firstUpdateCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(secondUpdateCalls).toContainEqual({ method: 'eq', args: ['id', 'gallery-c'] })
    expect(secondUpdateCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
  })

  it('does not remove gallery storage paths outside the current guild prefix', async () => {
    const { db, removeCalls } = createDb([
      createQuery({
        data: {
          id: 'gallery-b',
          image_url:
            'https://storage.test/storage/v1/object/public/guild-profiles/guild-2/gallery-old.webp',
        },
        error: null,
      }),
      createQuery({ error: null }),
      createQuery({ data: [], error: null }),
    ])
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(removeGalleryItem('gallery-b')).resolves.toEqual({})

    expect(removeCalls).toEqual([])
  })
})
