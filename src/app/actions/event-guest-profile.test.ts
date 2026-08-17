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
  getAppSetting: vi.fn(),
  searchPlayers: vi.fn(),
  consumeEventGuestRequestBudget: vi.fn(),
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

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/albion-gameinfo', () => ({
  isAlbionServer: (value: unknown) =>
    value === 'west' || value === 'east' || value === 'europe',
  searchPlayers: mocks.searchPlayers,
}))

vi.mock('@/lib/event-guest-security', () => ({
  consumeEventGuestRequestBudget: mocks.consumeEventGuestRequestBudget,
}))

import { saveEventGuestProfile } from './event-guest-profile'

function createDb(options: {
  guestRow?: Record<string, unknown> | null
  revokedRow?: Record<string, unknown> | null
  eventRow?: Record<string, unknown> | null
} = {}) {
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
          if (table === 'events') {
            return {
              data:
                options.eventRow === undefined
                  ? {
                      id: 'event-1',
                      status: 'published',
                      battle_started_at: null,
                      gather_at: new Date(Date.now() + 3_600_000).toISOString(),
                    }
                  : options.eventRow,
              error: null,
            }
          }
          if (table === 'guests') return { data: options.guestRow ?? null, error: null }
          if (table === 'guest_revocations') {
            return { data: options.revokedRow ?? null, error: null }
          }
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
    mocks.getAppSetting.mockResolvedValue('west')
    mocks.searchPlayers.mockResolvedValue([])
    mocks.consumeEventGuestRequestBudget.mockResolvedValue(true)
  })

  it('creates an event-scoped anonymous session from a valid invite without Discord login', async () => {
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
        characterName: 'GuestCharacter',
        locale: 'en',
        inviteToken: 'token-1',
      }),
    ).resolves.toEqual({ ok: true, characterVerified: false })

    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: 'guest_anon',
        username: 'Guest One',
        isGuest: true,
        eventScope: 'event-1',
        guildId: 'guild-1',
      }),
    )
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'user_session',
      'signed-session',
      { path: '/', httpOnly: true },
    )
    expect(upserts).toContainEqual({
      table: 'guests',
      row: expect.objectContaining({
        guild_id: 'guild-1',
        discord_id: 'guest_anon',
        username: 'Guest One',
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
        albion_server: 'west',
        albion_player_id: null,
        albion_character_name: 'GuestCharacter',
        character_verified: false,
      }),
      options: { onConflict: 'guild_id,event_id,discord_id' },
    })
  })

  it('creates a new guest profile after operational start so late signup remains possible', async () => {
    const { db, upserts } = createDb({
      eventRow: {
        id: 'event-1',
        status: 'published',
        battle_started_at: '2026-08-17T10:00:00.000Z',
        gather_at: '2026-08-17T09:00:00.000Z',
      },
    })
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
        displayName: 'Late Guest',
        characterName: 'LateGuestCharacter',
        locale: 'ko',
        inviteToken: 'token-1',
      }),
    ).resolves.toEqual({ ok: true, characterVerified: false })

    expect(upserts).toContainEqual({
      table: 'event_guest_profiles',
      row: expect.objectContaining({
        event_id: 'event-1',
        display_name: 'Late Guest',
        albion_character_name: 'LateGuestCharacter',
      }),
      options: { onConflict: 'guild_id,event_id,discord_id' },
    })
  })

  it('updates an active Discord-authenticated profile and records exact public character evidence', async () => {
    const { db, upserts } = createDb({
      guestRow: { discord_id: 'guest-1' },
    })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getSession.mockResolvedValue({
      discordId: 'guest-1',
      username: 'Guest User',
      avatar: 'avatar-hash',
      isGuest: true,
      eventScope: 'event-1',
      guildId: 'guild-1',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.searchPlayers.mockResolvedValue([
      {
        Id: 'player-1',
        Name: 'GuestCharacter',
        GuildId: 'albion-guild-1',
        GuildName: 'Friendly Guild',
      },
    ])

    await expect(
      saveEventGuestProfile({
        eventId: 'event-1',
        displayName: '  Guest   One  ',
        characterName: 'guestcharacter',
        locale: 'en',
        inviteToken: null,
      }),
    ).resolves.toEqual({ ok: true, characterVerified: true })

    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: 'guest-1',
        username: 'Guest One',
        isGuest: true,
        eventScope: 'event-1',
        guildId: 'guild-1',
      }),
    )
    expect(upserts).toContainEqual({
      table: 'event_guest_profiles',
      row: expect.objectContaining({
        guild_id: 'guild-1',
        event_id: 'event-1',
        discord_id: 'guest-1',
        display_name: 'Guest One',
        preferred_language: 'en',
        albion_server: 'west',
        albion_player_id: 'player-1',
        albion_character_name: 'GuestCharacter',
        albion_guild_name: 'Friendly Guild',
        character_verified: true,
      }),
      options: { onConflict: 'guild_id,event_id,discord_id' },
    })
  })

  it('rejects a revoked event guest session', async () => {
    const { db, upserts } = createDb({
      guestRow: { discord_id: 'guest-1' },
      revokedRow: { discord_id: 'guest-1' },
    })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getSession.mockResolvedValue({
      discordId: 'guest-1',
      username: 'Guest User',
      avatar: null,
      isGuest: true,
      eventScope: 'event-1',
      guildId: 'guild-1',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')

    await expect(
      saveEventGuestProfile({
        eventId: 'event-1',
        displayName: 'Guest One',
        characterName: 'GuestCharacter',
        locale: 'en',
        inviteToken: null,
      }),
    ).resolves.toEqual({ error: 'unauthorized' })

    expect(mocks.signSession).not.toHaveBeenCalled()
    expect(upserts).toEqual([])
  })
})
