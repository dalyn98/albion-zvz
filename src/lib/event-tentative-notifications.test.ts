import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  sendLocalizedDiscordDmToUser: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  tenantUrl: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: mocks.sendLocalizedDiscordDmToUser,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    warn: mocks.logWarn,
  },
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  tenantUrl: mocks.tenantUrl,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: { slot?: string }) => {
    if (key === 'recommendationSaved') return '권장 슬롯을 전달했습니다.'
    if (key === 'recommendationBadge') return `권장 · ${values?.slot}`
    if (key === 'events') return '이벤트'
    if (key === 'settings') return '설정'
    return key
  }),
}))

import { sendTentativeSlotRecommendationNotification } from './event-tentative-notifications'

function createSlotQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  }
  return query
}

describe('tentative slot recommendation notifications', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.sendLocalizedDiscordDmToUser.mockReset()
    mocks.logError.mockReset()
    mocks.logWarn.mockReset()
    mocks.getTenantDiscordConfig.mockReset()
    mocks.tenantUrl.mockReset()
    mocks.getTenantDiscordConfig.mockResolvedValue({ slug: 'menhera' })
    mocks.tenantUrl.mockImplementation((slug: string, path: string) => (
      `https://${slug}.example${path}`
    ))
  })

  it('sends a localized Discord DM with the event and human-readable slot label', async () => {
    const query = createSlotQuery({
      data: {
        id: 'slot-1',
        slot_number: 7,
        role_name: 'EngageDps',
        weapon_id: null,
        weapon_name: '장로의 브림스톤 스태프',
        parties: {
          event_id: 'event-1',
          party_number: 1,
          name: null,
          is_bomb_squad: false,
        },
      },
      error: null,
    })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query) })
    mocks.sendLocalizedDiscordDmToUser.mockImplementation(
      async (
        _discordId: string,
        _guildId: string,
        buildPayload: (_translator: unknown, locale: 'ko') => Promise<unknown>,
      ) => {
        const payload = await buildPayload(vi.fn(), 'ko')
        expect(payload).toEqual({
          title: '권장 슬롯을 전달했습니다.',
          body: 'Reset day\n권장 · 1-7 (브림스톤 스태프)',
          actions: [
            {
              label: '이벤트',
              url: 'https://menhera.example/events/event-1',
            },
            {
              label: '설정',
              url: 'https://menhera.example/me/settings#discord-dm',
            },
          ],
        })
        return { attempted: 1, succeeded: 1 }
      },
    )

    await sendTentativeSlotRecommendationNotification({
      guildId: 'guild-1',
      eventId: 'event-1',
      eventTitle: 'Reset day',
      discordId: 'member-1',
      slotId: 'slot-1',
    })

    expect(mocks.sendLocalizedDiscordDmToUser).toHaveBeenCalledWith(
      'member-1',
      'guild-1',
      expect.any(Function),
    )
    expect(query.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(query.eq).toHaveBeenCalledWith('parties.event_id', 'event-1')
    expect(mocks.tenantUrl).toHaveBeenCalledWith('menhera', '/me/settings#discord-dm')
  })

  it('does not attempt a DM when the selected slot can no longer be loaded', async () => {
    const query = createSlotQuery({ data: null, error: new Error('missing') })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query) })

    await sendTentativeSlotRecommendationNotification({
      guildId: 'guild-1',
      eventId: 'event-1',
      eventTitle: 'Reset day',
      discordId: 'member-1',
      slotId: 'slot-1',
    })

    expect(mocks.sendLocalizedDiscordDmToUser).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledOnce()
  })
})
