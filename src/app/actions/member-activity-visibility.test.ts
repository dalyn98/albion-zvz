import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  buildPublicActivityUrl: vi.fn((token: string) => `https://public.test/u/${token}`),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/member-activity-public-url', () => ({
  buildPublicActivityUrl: mocks.buildPublicActivityUrl,
}))

import { setMyActivityVisibility } from './member-activity-visibility'

interface UpdateCall {
  payload: Record<string, unknown>
}

function createDb(returnedToken: string) {
  const updateCalls: UpdateCall[] = []
  const query = {
    update(payload: Record<string, unknown>) {
      updateCalls.push({ payload })
      return query
    },
    eq() {
      return query
    },
    is() {
      return query
    },
    select() {
      return query
    },
    maybeSingle() {
      return Promise.resolve({
        data: {
          public_activity_token: returnedToken,
          public_activity_enabled: Boolean(updateCalls.at(-1)?.payload.public_activity_enabled),
        },
        error: null,
      })
    },
  }
  return {
    db: {
      from: vi.fn((table: string) => {
        expect(table).toBe('account_albion_tenant_links')
        return query
      }),
    },
    updateCalls,
  }
}

describe('setMyActivityVisibility', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.buildPublicActivityUrl.mockClear()
    mocks.getSession.mockResolvedValue({
      discordId: 'user-1',
      isMember: true,
      isLocalGuildAccount: false,
    })
  })

  it('rotates the public activity token when making a record private', async () => {
    const { db, updateCalls } = createDb('rotated-token')
    mocks.getAdminClient.mockReturnValue(db)

    await expect(setMyActivityVisibility('guild-1', false)).resolves.toMatchObject({
      ok: true,
      enabled: false,
      publicUrl: 'https://public.test/u/rotated-token',
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toMatchObject({
      public_activity_enabled: false,
      public_activity_enabled_at: null,
    })
    expect(updateCalls[0].payload.public_activity_token).toEqual(expect.any(String))
    expect(updateCalls[0].payload.public_activity_token).not.toBe('rotated-token')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/public/u/rotated-token')
  })

  it('keeps the current token when enabling an already private record', async () => {
    const { db, updateCalls } = createDb('current-token')
    mocks.getAdminClient.mockReturnValue(db)

    await expect(setMyActivityVisibility('guild-1', true)).resolves.toMatchObject({
      ok: true,
      enabled: true,
      publicUrl: 'https://public.test/u/current-token',
    })

    expect(updateCalls[0].payload).toMatchObject({
      public_activity_enabled: true,
    })
    expect(updateCalls[0].payload).not.toHaveProperty('public_activity_token')
  })
})
