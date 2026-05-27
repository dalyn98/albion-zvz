import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  cookieSet: vi.fn(),
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  getAdminClient: vi.fn(),
  resolveEventGuestInviteScope: vi.fn(),
  createAnonymousEventGuestId: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookieSet })),
  headers: vi.fn(async () => ({ get: vi.fn(() => 'menhera.albion-guildmanager.com') })),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  getSession: mocks.getSession,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/i18n/locales', () => ({
  LOCALE_COOKIE: 'NEXT_LOCALE',
  isLocale: (value: unknown) => ['ko', 'ja', 'en', 'zh'].includes(String(value)),
}))

vi.mock('@/lib/locale-cookie', () => ({
  localeCookieOptions: vi.fn(() => ({ path: '/', sameSite: 'lax' })),
}))

vi.mock('@/lib/event-guest-auth', () => ({
  resolveEventGuestInviteScope: mocks.resolveEventGuestInviteScope,
}))

vi.mock('@/lib/event-guest-identity', () => ({
  createAnonymousEventGuestId: mocks.createAnonymousEventGuestId,
}))

import { saveEventGuestProfile } from './event-guest-profile'

function createDb() {
  const upserts: Array<{ table: string; row: unknown; options: unknown }> = []
  const updates: Array<{ table: string; row: unknown }> = []
  const db = {
    from(table: string) {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        update: vi.fn((row: unknown) => {
          updates.push({ table, row })
          return chain
        }),
        upsert: vi.fn(async (row: unknown, options: unknown) => {
          upserts.push({ table, row, options })
          return { error: null }
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'events') return { data: { id: 'event-1' }, error: null }
          return { data: null, error: null }
        }),
        then: (resolve: (value: unknown) => void) => {
          if (table === 'parties') resolve({ data: [{ id: 'party-1' }], error: null })
          else resolve({ error: null })
        },
      }
      return chain
    },
  }
  return { db, upserts, updates }
}

describe('saveEventGuestProfile', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.signSession.mockResolvedValue('signed-session')
    mocks.createAnonymousEventGuestId.mockReturnValue('guest_anon')
  })

  it('creates an anonymous event-scoped guest session from a valid invite token', async () => {
    const { db, upserts } = createDb()
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getSession.mockResolvedValue(null)
    mocks.resolveEventGuestInviteScope.mockResolvedValue({
      eventId: 'event-1',
      guildId: 'guild-1',
      source: 'invite',
    })

    await expect(
      saveEventGuestProfile({
        eventId: 'event-1',
        displayName: '  Guest   One  ',
        locale: 'en',
        inviteToken: 'token-1',
      }),
    ).resolves.toEqual({ ok: true })

    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: 'guest_anon',
        username: 'Guest One',
        isGuest: true,
        isMember: false,
        eventScope: 'event-1',
        guildId: 'guild-1',
      }),
    )
    expect(mocks.cookieSet).toHaveBeenCalledWith('user_session', 'signed-session', {
      path: '/',
      httpOnly: true,
    })
    expect(upserts).toContainEqual({
      table: 'guests',
      row: expect.objectContaining({
        guild_id: 'guild-1',
        discord_id: 'guest_anon',
        username: 'Guest One',
        preferred_language: 'en',
      }),
      options: { onConflict: 'guild_id,discord_id' },
    })
    expect(upserts).toContainEqual({
      table: 'event_guest_profiles',
      row: expect.objectContaining({
        guild_id: 'guild-1',
        event_id: 'event-1',
        discord_id: 'guest_anon',
        display_name: 'Guest One',
        preferred_language: 'en',
      }),
      options: { onConflict: 'guild_id,event_id,discord_id' },
    })
  })
})
