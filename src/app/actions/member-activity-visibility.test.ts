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

import {
  setMyActivityVisibility,
  setMyLeaderboardVisibility,
} from './member-activity-visibility'

interface UpdateCall {
  payload: Record<string, unknown>
}

function createDb(
  returnedToken: string,
  options: {
    publicActivityEnabled?: boolean
    returnNoRowWhenLeaderboardRequiresActivity?: boolean
  } = {},
) {
  const updateCalls: UpdateCall[] = []
  const eqCalls: Array<[string, unknown]> = []
  const query = {
    update(payload: Record<string, unknown>) {
      updateCalls.push({ payload })
      return query
    },
    eq(column: string, value: unknown) {
      eqCalls.push([column, value])
      return query
    },
    is() {
      return query
    },
    select() {
      return query
    },
    maybeSingle() {
      const lastPayload = updateCalls.at(-1)?.payload ?? {}
      const requiresPublicActivity = eqCalls.some(
        ([column, value]) =>
          column === 'public_activity_enabled' && value === true,
      )
      if (
        requiresPublicActivity &&
        options.returnNoRowWhenLeaderboardRequiresActivity
      ) {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({
        data: {
          public_activity_token: returnedToken,
          public_activity_enabled:
            lastPayload.public_activity_enabled ??
            options.publicActivityEnabled ??
            false,
          public_leaderboard_enabled: Boolean(
            lastPayload.public_leaderboard_enabled,
          ),
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
    eqCalls,
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
      public_leaderboard_enabled: false,
      public_leaderboard_enabled_at: null,
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

  it('requires a separate opt-in and only enables it for a public activity record', async () => {
    const { db, updateCalls, eqCalls } = createDb('public-token', {
      publicActivityEnabled: true,
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      setMyLeaderboardVisibility('guild-1', true),
    ).resolves.toEqual({ ok: true, enabled: true })

    expect(updateCalls[0].payload).toMatchObject({
      public_leaderboard_enabled: true,
    })
    expect(eqCalls).toContainEqual(['public_activity_enabled', true])
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/public/u/public-token',
    )
  })

  it('refuses leaderboard publication while the activity record is private', async () => {
    const { db } = createDb('private-token', {
      returnNoRowWhenLeaderboardRequiresActivity: true,
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      setMyLeaderboardVisibility('guild-1', true),
    ).resolves.toEqual({
      ok: false,
      error: 'activity_must_be_public',
    })
  })
})
