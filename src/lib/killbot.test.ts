import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildKillbotBattleDiscordPayload,
  buildKillbotBattleGroupUrl,
  buildKillbotBattleTestSummary,
  buildKillbotBattleSummary,
  buildKillbotDiscordMessage,
  buildKillbotDiscordPayload,
  classifyKillbotEvent,
  fetchRecentKillbotEvents,
  isKillbotBattleSummaryReady,
  isKillbotEventInsideProcessWindow,
  resolveKillbotFeedChannels,
  killbotNotificationSettingsToFeedMode,
  type AlbionKillbotEvent,
  type KillbotConfig,
  type KillbotTarget,
} from './killbot'
import {
  formatKillbotVictimValueLabel,
  getKillbotDisplayedDeathFame,
  KILLBOT_CARD_FONT_FAMILY,
  KILLBOT_CARD_FONT_FILE,
  KILLBOT_CENTER_LAYOUT,
  KILLBOT_CENTER_ICON_ASSETS,
  renderKillbotCardPng,
} from './killbot-card'
import type { KillbotVictimValueEstimate } from './killbot-value'

afterEach(() => {
  vi.unstubAllGlobals()
})

const target: KillbotTarget = {
  server: 'east',
  homeGuildId: 'guild-home',
  homeGuildName: 'Menhera',
  tenantSlug: 'menhera',
}

const config = {
  minFame: 1,
  juicyFameThreshold: 1000,
  includeKills: true,
  includeDeaths: true,
}

const fullConfig: KillbotConfig = {
  guildId: 'guild-1',
  enabled: true,
  channelId: '12345',
  individualLogChannelId: null,
  battleSummaryChannelId: '12345',
  minFame: 1,
  juicyFameThreshold: 1000,
  includeKills: true,
  includeDeaths: true,
  feedMode: 'battle',
  individualLogsEnabled: false,
  battleSummariesEnabled: true,
  mentionRoleId: '99999',
  lastPolledAt: null,
  lastSentAt: null,
  lastError: null,
  updatedAt: null,
}

function event(overrides: Partial<AlbionKillbotEvent> = {}): AlbionKillbotEvent {
  return {
    EventId: 1,
    TimeStamp: '2026-05-26T12:00:00Z',
    TotalVictimKillFame: 1200,
    Killer: { Id: 'killer', Name: 'Killer', GuildId: 'guild-home', GuildName: 'Menhera' },
    Victim: { Id: 'victim', Name: 'Victim', GuildId: 'enemy', GuildName: 'Enemy' },
    ...overrides,
  }
}

describe('classifyKillbotEvent', () => {
  it('classifies home-guild kills', () => {
    const matches = classifyKillbotEvent(event(), target, config)
    expect(matches).toEqual([
      {
        feedType: 'kill',
        fame: 1200,
        isJuicy: true,
        killerName: 'Killer',
        victimName: 'Victim',
      },
    ])
  })

  it('classifies home-guild deaths', () => {
    const matches = classifyKillbotEvent(
      event({
        Killer: { Id: 'killer', Name: 'Killer', GuildId: 'enemy', GuildName: 'Enemy' },
        Victim: { Id: 'victim', Name: 'Victim', GuildId: 'guild-home', GuildName: 'Menhera' },
      }),
      target,
      config,
    )
    expect(matches[0]?.feedType).toBe('death')
  })

  it('filters events below minimum fame', () => {
    const matches = classifyKillbotEvent(
      event({ TotalVictimKillFame: 0 }),
      target,
      { ...config, minFame: 1 },
    )
    expect(matches).toHaveLength(0)
  })

  it('does not post internal guild kills', () => {
    const matches = classifyKillbotEvent(
      event({
        Victim: { Id: 'victim', Name: 'Victim', GuildId: 'guild-home', GuildName: 'Menhera' },
      }),
      target,
      config,
    )
    expect(matches).toHaveLength(0)
  })
})

describe('fetchRecentKillbotEvents', () => {
  it('continues beyond the first global events page', async () => {
    const now = new Date('2026-05-27T12:00:00Z')
    const firstPage = Array.from({ length: 51 }, (_, index) =>
      event({
        EventId: 1000 + index,
        TimeStamp: new Date(now.getTime() - index * 1000).toISOString(),
        Killer: { Id: `killer-${index}`, Name: `Killer ${index}`, GuildId: 'other', GuildName: 'Other' },
        Victim: { Id: `victim-${index}`, Name: `Victim ${index}`, GuildId: 'enemy', GuildName: 'Enemy' },
      }),
    )
    const delayedHomeKill = event({
      EventId: 2000,
      TimeStamp: new Date(now.getTime() - 6 * 60 * 1000).toISOString(),
      Killer: { Id: 'home', Name: 'Home Killer', GuildId: 'guild-home', GuildName: 'Menhera' },
      Victim: { Id: 'victim', Name: 'Victim', GuildId: 'enemy', GuildName: 'Enemy' },
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const body = offset === 0 ? firstPage : [delayedHomeKill]
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const events = await fetchRecentKillbotEvents('east', {
      now,
      lookbackMs: 20 * 60 * 1000,
      maxPages: 3,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(events.map((e) => e.EventId)).toContain(2000)
  })

  it('stops paging after reaching the lookback cutoff', async () => {
    const now = new Date('2026-05-27T12:00:00Z')
    const recentPage = Array.from({ length: 51 }, (_, index) =>
      event({
        EventId: 3000 + index,
        TimeStamp: new Date(now.getTime() - index * 1000).toISOString(),
      }),
    )
    const oldPage = Array.from({ length: 51 }, (_, index) =>
      event({
        EventId: 4000 + index,
        TimeStamp: new Date(now.getTime() - 30 * 60 * 1000 - index * 1000).toISOString(),
      }),
    )
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const body = offset === 0 ? recentPage : oldPage
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const events = await fetchRecentKillbotEvents('east', {
      now,
      lookbackMs: 20 * 60 * 1000,
      maxPages: 4,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(events.some((e) => e.EventId >= 4000)).toBe(false)
  })
})

describe('isKillbotEventInsideProcessWindow', () => {
  it('keeps an overlap before the previous successful poll', () => {
    const delayedEvent = event({ TimeStamp: '2026-05-27T12:15:00Z' })
    expect(
      isKillbotEventInsideProcessWindow(
        delayedEvent,
        '2026-05-27T12:19:00Z',
        '2026-05-27T12:24:00Z',
      ),
    ).toBe(true)
  })

  it('does not turn the wider fetch into a historical backfill', () => {
    const oldEvent = event({ TimeStamp: '2026-05-27T12:15:00Z' })
    expect(
      isKillbotEventInsideProcessWindow(
        oldEvent,
        '2026-05-27T12:24:00Z',
        '2026-05-27T12:25:00Z',
      ),
    ).toBe(false)
  })
})

describe('isKillbotBattleSummaryReady', () => {
  const endedAt = '2026-05-27T12:00:00.000Z'
  const settleMs = 30 * 60 * 1000

  it('waits until the battle end buffer has passed', () => {
    expect(
      isKillbotBattleSummaryReady({
        endedAt,
        lastKillboardSyncAt: '2026-05-27T12:35:00.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:35:00.000Z',
        nowIso: '2026-05-27T12:29:59.000Z',
        settleMs,
      }),
    ).toBe(false)
  })

  it('waits for killboard sync to catch up after the buffer point', () => {
    expect(
      isKillbotBattleSummaryReady({
        endedAt,
        lastKillboardSyncAt: '2026-05-27T12:29:59.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:35:00.000Z',
        nowIso: '2026-05-27T12:35:00.000Z',
        settleMs,
      }),
    ).toBe(false)
  })

  it('waits for battle tracker sync to catch up after the buffer point', () => {
    expect(
      isKillbotBattleSummaryReady({
        endedAt,
        lastKillboardSyncAt: '2026-05-27T12:35:00.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:29:59.000Z',
        nowIso: '2026-05-27T12:35:00.000Z',
        settleMs,
      }),
    ).toBe(false)
  })

  it('allows summaries once time and both sync jobs passed the buffer point', () => {
    expect(
      isKillbotBattleSummaryReady({
        endedAt,
        lastKillboardSyncAt: '2026-05-27T12:30:00.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:30:00.000Z',
        nowIso: '2026-05-27T12:30:01.000Z',
        settleMs,
      }),
    ).toBe(true)
  })

  it('rejects missing or invalid battle end timestamps', () => {
    expect(
      isKillbotBattleSummaryReady({
        endedAt: null,
        lastKillboardSyncAt: '2026-05-27T12:35:00.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:35:00.000Z',
        nowIso: '2026-05-27T12:35:00.000Z',
        settleMs,
      }),
    ).toBe(false)
    expect(
      isKillbotBattleSummaryReady({
        endedAt: 'not-a-date',
        lastKillboardSyncAt: '2026-05-27T12:35:00.000Z',
        lastBattleTrackerSyncAt: '2026-05-27T12:35:00.000Z',
        nowIso: '2026-05-27T12:35:00.000Z',
        settleMs,
      }),
    ).toBe(false)
  })
})

describe('buildKillbotBattleGroupUrl', () => {
  it('links grouped battle summaries to the public tenant battle report', () => {
    expect(buildKillbotBattleGroupUrl('east', [474488420, 474492254], 'menhera')).toBe(
      'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=474488420,474492254',
    )
  })

  it('deduplicates and sorts battle ids for stable group links', () => {
    expect(buildKillbotBattleGroupUrl('west', [3, 2, 3, 1], 'menhera')).toBe(
      'https://menhera.albion-guildmanager.com/battles/multi?server=west&ids=1,2,3',
    )
  })
})

describe('killbotNotificationSettingsToFeedMode', () => {
  it('maps separate individual-log and battle-summary settings to the persisted feed mode', () => {
    expect(
      killbotNotificationSettingsToFeedMode({
        individualLogsEnabled: false,
        battleSummariesEnabled: true,
      }),
    ).toBe('battle')
    expect(
      killbotNotificationSettingsToFeedMode({
        individualLogsEnabled: true,
        battleSummariesEnabled: false,
      }),
    ).toBe('event')
    expect(
      killbotNotificationSettingsToFeedMode({
        individualLogsEnabled: true,
        battleSummariesEnabled: true,
      }),
    ).toBe('both')
  })

  it('keeps at least one feed enabled when both separate settings are off', () => {
    expect(
      killbotNotificationSettingsToFeedMode({
        individualLogsEnabled: false,
        battleSummariesEnabled: false,
      }),
    ).toBe('battle')
  })
})

describe('resolveKillbotFeedChannels', () => {
  it('falls back legacy channel settings to both feed channels', () => {
    expect(
      resolveKillbotFeedChannels({
        channelId: 'legacy-channel',
        individualLogChannelId: null,
        battleSummaryChannelId: null,
      }),
    ).toEqual({
      individualLogChannelId: 'legacy-channel',
      battleSummaryChannelId: 'legacy-channel',
      hasAnyChannel: true,
    })
  })

  it('uses separate channels for individual logs and battle summaries', () => {
    expect(
      resolveKillbotFeedChannels({
        channelId: 'legacy-channel',
        individualLogChannelId: 'log-channel',
        battleSummaryChannelId: 'battle-channel',
      }),
    ).toEqual({
      individualLogChannelId: 'log-channel',
      battleSummaryChannelId: 'battle-channel',
      hasAnyChannel: true,
    })
  })
})

describe('buildKillbotDiscordPayload', () => {
  it('builds a text-only battle summary embed with linked top K/D rows', () => {
    const summary = buildKillbotBattleSummary({
      battleDetailUrl: 'https://menhera.albion-guildmanager.com/battles/battle-row',
      battleEventUrl: (eventId) =>
        `https://menhera.albion-guildmanager.com/battles/battle-row?event=${eventId}#killbot-event-${eventId}`,
      albionBattleId: 77,
      clusterName: 'Darkbough Snag',
      startedAt: '2026-05-26T12:00:00Z',
      homeGuildName: 'Menhera',
      opponentName: 'Enemy Alliance',
      homeTeamSize: 42,
      opponentTeamSize: 39,
      homeKills: 18,
      homeDeaths: 7,
      homeKillFame: 12_400_000,
      resultLabel: 'Win',
      minFame: 1,
      juicyFameThreshold: 1_000_000,
      forceLines: [
        {
          forceName: 'GRU',
          guildNames: ['Menhera', 'MINlONS'],
          players: 42,
          kills: 18,
          deaths: 7,
          killFame: 12_400_000,
        },
      ],
      events: [
        {
          eventId: 101,
          role: 'killer',
          playerName: 'TopKiller',
          fame: 1_800_000,
          occurredAt: '2026-05-26T12:03:00Z',
        },
        {
          eventId: 102,
          role: 'killer',
          playerName: 'TopKiller',
          fame: 900_000,
          occurredAt: '2026-05-26T12:04:00Z',
        },
        {
          eventId: 103,
          role: 'victim',
          playerName: 'TopKiller',
          fame: 700_000,
          occurredAt: '2026-05-26T12:06:00Z',
        },
        {
          eventId: 104,
          role: 'victim',
          playerName: 'DownedCaller',
          fame: 2_100_000,
          occurredAt: '2026-05-26T12:07:00Z',
        },
      ],
    })
    const payload = buildKillbotBattleDiscordPayload(summary, fullConfig, target)

    expect(payload.content).toBe(
      '<@&99999>\nhttps://menhera.albion-guildmanager.com/battles/battle-row',
    )
    expect(payload.embeds).toHaveLength(1)
    expect(payload.embeds[0]).toMatchObject({
      title: 'Menhera 18K / 7D vs Enemy Alliance',
      url: 'https://menhera.albion-guildmanager.com/battles/battle-row',
      thumbnail: undefined,
      image: undefined,
    })
    expect(payload.embeds[0]?.description).toContain('Battle 77 · Darkbough Snag · Win')
    expect(payload.embeds[0]?.description).toContain('42v39 · Fame 12.4M')
    expect(payload.embeds[0]?.fields).toEqual([
      {
        name: 'Forces',
        value:
          '**GRU** _(Menhera, MINlONS)_\n`Players 42` `Kills 18` `Deaths 7` `Fame 12.4M`',
      },
    ])
  })

  it('builds a grouped battle summary with all battle ids in the description', () => {
    const summary = buildKillbotBattleSummary({
      battleDetailUrl: 'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=77,78',
      battleEventUrl: (eventId) => `https://albiononline.com/killboard/kill/${eventId}`,
      albionBattleId: 77,
      albionBattleIds: [77, 78],
      clusterName: null,
      startedAt: '2026-05-26T12:00:00Z',
      homeGuildName: 'Menhera',
      opponentName: 'Multiple opponents',
      homeTeamSize: 42,
      opponentTeamSize: 71,
      homeKills: 28,
      homeDeaths: 14,
      homeKillFame: 18_900_000,
      resultLabel: '2 battles',
      minFame: 1,
      juicyFameThreshold: 1_000_000,
      events: [
        {
          eventId: 101,
          role: 'killer',
          playerName: 'Caller',
          fame: 1_800_000,
          occurredAt: '2026-05-26T12:03:00Z',
        },
        {
          eventId: 201,
          role: 'victim',
          playerName: 'Caller',
          fame: 900_000,
          occurredAt: '2026-05-26T12:21:00Z',
        },
      ],
    })

    expect(summary.title).toBe('Menhera 28K / 14D vs Multiple opponents')
    expect(summary.detailUrl).toBe(
      'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=77,78',
    )
    expect(summary.description).toContain('Albion battles 77, 78')
    expect(summary.description).toContain('2 battles')
  })

  it('builds a battle summary test payload with a visible battle link', () => {
    const summary = buildKillbotBattleTestSummary(fullConfig, target)
    const payload = buildKillbotBattleDiscordPayload(
      summary,
      { ...fullConfig, mentionRoleId: null },
      target,
    )

    expect(payload.content).toBe(
      'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=123456789,123456790',
    )
    expect(payload.embeds[0]).toMatchObject({
      title: 'AlbionGuildManager battle summary test',
      url: 'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=123456789,123456790',
    })
    expect(payload.embeds[0]?.description).toContain('Albion battles 123456789, 123456790')
    expect(payload.embeds[0]?.fields?.[0]).toMatchObject({ name: 'Forces' })
    expect(payload.embeds[0]?.fields?.[0]?.value).toContain(
      '**GRU** _(Menhera, MINlONS)_\n`Players 36` `Kills 84` `Deaths 22` `Fame 62.5M`',
    )
    expect(payload.embeds[0]?.fields?.some((field) => field.name === 'Top Kills')).toBe(false)
  })

  it('builds a compact Discord embed for a kill', () => {
    const payload = buildKillbotDiscordPayload(
      event({
        BattleId: 77,
        Killer: {
          Id: 'killer',
          Name: 'Killer',
          GuildId: 'guild-home',
          GuildName: 'Menhera',
          AverageItemPower: 1942.4,
        },
        Victim: {
          Id: 'victim',
          Name: 'Victim',
          GuildId: 'enemy',
          GuildName: 'Enemy',
          AverageItemPower: 1208,
          Equipment: {
            MainHand: { Type: 'T8_MAIN_HOLYSTAFF@4' },
            OffHand: { Type: 'T8_OFF_BOOK@2' },
            Head: { Type: 'T8_HEAD_CLOTH_SET3@1' },
            Armor: { Type: 'T8_ARMOR_CLOTH_SET3@1' },
            Shoes: { Type: 'T8_SHOES_CLOTH_SET3@1' },
            Cape: { Type: 'T8_CAPEITEM_FW_LYMHURST' },
            Mount: { Type: 'T8_MOUNT_HORSE_UNDEAD' },
            Potion: { Type: 'T8_POTION_HEAL' },
            Food: { Type: 'T8_MEAL_OMELETTE' },
          },
          Inventory: [
            { Type: 'T8_POTION_HEAL', Count: 3 },
            { Type: 'T8_MEAL_OMELETTE', Count: 2 },
          ],
        },
        Participants: [
          { Id: 'killer', Name: 'Killer', GuildId: 'guild-home', GuildName: 'Menhera' },
          { Id: 'assist-1', Name: 'Assistant', GuildId: 'guild-home', GuildName: 'Menhera' },
        ],
      }),
      {
        feedType: 'kill',
        fame: 1200,
        isJuicy: true,
        killerName: 'Killer',
        victimName: 'Victim',
      },
      fullConfig,
      target,
    )

    expect(payload.content).toBe('<@&99999>')
    expect(payload.allowed_mentions).toEqual({ parse: [], roles: ['99999'] })
    expect(payload.embeds).toHaveLength(1)
    expect(payload.embeds[0]).toMatchObject({
      title: 'Killer (1942) ⚔ Victim (1208)',
      url: 'https://albiononline.com/killboard/kill/1',
      thumbnail: {
        url: 'https://render.albiononline.com/v1/item/T8_MAIN_HOLYSTAFF%404.png?size=128',
      },
    })
    const mainEmbed = payload.embeds[0]
    expect(mainEmbed.fields).toBeUndefined()
    expect(mainEmbed.description).toContain('Menhera kill · Juicy · Fame 1,200 · Battle 77')
    expect(mainEmbed.description).toContain('Participants: Assistant')
    expect(mainEmbed.footer?.text).toBe('Powered by Albion Guild Manager · Killbot')
  })

  it('attaches the generated kill card image when building a sendable message', async () => {
    const valueEstimate: KillbotVictimValueEstimate = {
      totalSilver: 1_012_000,
      gearSilver: 1_000_000,
      inventorySilver: 12_000,
      totalItems: 2,
      pricedItems: 2,
      missingItems: 0,
      isPartial: false,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    const message = await buildKillbotDiscordMessage(
      event({
        Killer: {
          Id: 'killer',
          Name: 'Killer',
          GuildId: 'guild-home',
          GuildName: 'Menhera',
          AverageItemPower: 1942.4,
          Equipment: {
            MainHand: { Type: 'T8_MAIN_HOLYSTAFF@4' },
          },
        },
        Victim: {
          Id: 'victim',
          Name: 'Victim',
          GuildId: 'enemy',
          GuildName: 'Enemy',
          AverageItemPower: 1208,
          Equipment: {
            MainHand: { Type: 'T8_2H_CLAYMORE_AVALON@2' },
          },
          Inventory: [{ Type: 'T8_POTION_HEAL', Count: 3 }],
        },
      }),
      {
        feedType: 'kill',
        fame: 1200,
        isJuicy: true,
        killerName: 'Killer',
        victimName: 'Victim',
      },
      fullConfig,
      target,
      valueEstimate,
    )

    const file = message.files?.[0]
    expect(file).toMatchObject({
      filename: 'killbot-card.png',
      contentType: 'image/png',
    })
    if (!file) throw new Error('expected killbot card file')
    expect(file.data.byteLength).toBeGreaterThan(1000)
    const { default: sharp } = await import('sharp')
    const metadata = await sharp(file.data).metadata()
    expect(metadata).toMatchObject({ width: 1200, height: 800, format: 'png' })
    expect(message.payload.embeds[0]?.image?.url).toBe('attachment://killbot-card.png')
    expect(message.payload.embeds[0]?.thumbnail).toBeUndefined()
  })
})

describe('killbot card font', () => {
  it('resolves the bundled card font used by sharp text rendering', () => {
    expect(KILLBOT_CARD_FONT_FAMILY).toBe('Arimo')
    expect(KILLBOT_CARD_FONT_FILE).toMatch(/Arimo\.ttf$/)
    expect(existsSync(KILLBOT_CARD_FONT_FILE)).toBe(true)
  })
})

describe('killbot card center metrics', () => {
  it('uses victim death fame for the center fame value', () => {
    const sampleEvent = event({
      TotalVictimKillFame: 1200,
      Victim: {
        Id: 'victim',
        Name: 'Victim',
        GuildId: 'enemy',
        GuildName: 'Enemy',
        DeathFame: 987654,
      },
    })
    const match = {
      feedType: 'kill' as const,
      fame: 1200,
      isJuicy: true,
      killerName: 'Killer',
      victimName: 'Victim',
    }

    expect(getKillbotDisplayedDeathFame(sampleEvent, match)).toBe(987654)
  })

  it('prints victim estimated value without compact M/K/B units', () => {
    const estimate: KillbotVictimValueEstimate = {
      totalSilver: 12_450_000,
      gearSilver: 10_800_000,
      inventorySilver: 1_650_000,
      totalItems: 17,
      pricedItems: 17,
      missingItems: 0,
      isPartial: false,
    }

    expect(formatKillbotVictimValueLabel(estimate)).toBe('12,450,000')
  })

  it('keeps center values wide enough for full silver numbers', () => {
    expect(KILLBOT_CENTER_LAYOUT.metrics.fame.valueWidth).toBeGreaterThanOrEqual(220)
    expect(KILLBOT_CENTER_LAYOUT.metrics.silver.valueWidth).toBeGreaterThanOrEqual(220)
  })
})

describe('killbot card center icons', () => {
  it('uses bundled official wiki image assets for fame and silver', async () => {
    expect(KILLBOT_CENTER_ICON_ASSETS.fame.sourceUrl).toBe(
      'https://wiki.albiononline.com/wiki/File:This._Is._Albion!_Icon.png',
    )
    expect(KILLBOT_CENTER_ICON_ASSETS.silver.sourceUrl).toBe(
      'https://wiki.albiononline.com/wiki/File:SilverCoins.png',
    )
    expect(KILLBOT_CENTER_ICON_ASSETS.kill.sourceUrl).toBe(
      'https://wiki.albiononline.com/wiki/File:M-m-m-monster_Kill!_Icon.png',
    )

    const { default: sharp } = await import('sharp')
    for (const asset of Object.values(KILLBOT_CENTER_ICON_ASSETS)) {
      expect(asset.filePath).toContain('/public/killbot/')
      expect(existsSync(asset.filePath)).toBe(true)
      const metadata = await sharp(asset.filePath).metadata()
      expect(metadata.format).toBe('png')
      expect(metadata.width).toBeGreaterThanOrEqual(24)
      expect(metadata.height).toBeGreaterThanOrEqual(24)
    }
  })
})

describe('killbot card center layout', () => {
  it('aligns fame and silver values and labels killer/victim sides', () => {
    expect(KILLBOT_CENTER_LAYOUT.metrics.fame.valueX).toBe(
      KILLBOT_CENTER_LAYOUT.metrics.silver.valueX,
    )
    expect(KILLBOT_CENTER_LAYOUT.metrics.fame.valueAnchor).toBe('start')
    expect(KILLBOT_CENTER_LAYOUT.metrics.silver.valueAnchor).toBe('start')
    expect(KILLBOT_CENTER_LAYOUT.roles.killer.label).toBe('KILLER')
    expect(KILLBOT_CENTER_LAYOUT.roles.victim.label).toBe('VICTIM')
    expect(KILLBOT_CENTER_LAYOUT.roles.killer.markerStyle).toBe('underline')
    expect(KILLBOT_CENTER_LAYOUT.roles.victim.markerStyle).toBe('underline')
    expect(KILLBOT_CENTER_LAYOUT.roles.killer.labelSize).toBeGreaterThanOrEqual(16)
    expect(KILLBOT_CENTER_LAYOUT.roles.victim.labelSize).toBeGreaterThanOrEqual(16)
    expect(KILLBOT_CENTER_LAYOUT.roles.killer.labelY).toBeLessThan(
      KILLBOT_CENTER_LAYOUT.roles.killer.nameY,
    )
    expect(KILLBOT_CENTER_LAYOUT.roles.victim.labelY).toBeLessThan(
      KILLBOT_CENTER_LAYOUT.roles.victim.nameY,
    )
    expect(KILLBOT_CENTER_LAYOUT.kill.source).toBe('official-monster-kill')
  })
})

describe('killbot card item icons', () => {
  it('ignores tier-only placeholder item ids from Albion event payloads', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const sampleEvent = event({
      Victim: {
        Id: 'victim',
        Name: 'Victim',
        GuildId: 'enemy',
        GuildName: 'Enemy',
        Equipment: {
          MainHand: { Type: 'T7' },
          Armor: { Type: 'T7@1' },
        },
        Inventory: [{ Type: 'T7', Count: 3 }],
      },
    })
    const match = {
      feedType: 'kill' as const,
      fame: 1200,
      isJuicy: true,
      killerName: 'Killer',
      victimName: 'Victim',
    }

    await renderKillbotCardPng(sampleEvent, match, target)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not keep a transient icon fetch failure cached as an empty slot', async () => {
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(onePixelPng, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const sampleEvent = event({
      Killer: {
        Id: 'killer',
        Name: 'Killer',
        GuildId: 'guild-home',
        GuildName: 'Menhera',
        Equipment: {
          MainHand: { Type: 'T4_MAIN_SWORD_ICON_CACHE_TEST' },
        },
      },
    })
    const match = {
      feedType: 'kill' as const,
      fame: 1200,
      isJuicy: true,
      killerName: 'Killer',
      victimName: 'Victim',
    }

    await renderKillbotCardPng(sampleEvent, match, target)
    await renderKillbotCardPng(sampleEvent, match, target)

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('killbot card layout', () => {
  it('keeps inventory item rendering out of the bottom crop-risk strip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    const match = {
      feedType: 'kill' as const,
      fame: 1200,
      isJuicy: true,
      killerName: 'Killer',
      victimName: 'Victim',
    }
    const noInventory = await renderKillbotCardPng(
      event({
        Victim: {
          Id: 'victim',
          Name: 'Victim',
          GuildId: 'enemy',
          GuildName: 'Enemy',
          Inventory: [],
        },
      }),
      match,
      target,
    )
    const manyInventory = await renderKillbotCardPng(
      event({
        Victim: {
          Id: 'victim',
          Name: 'Victim',
          GuildId: 'enemy',
          GuildName: 'Enemy',
          Inventory: Array.from({ length: 24 }, (_, index) => ({
            Type: `T8_RENDER_TEST_ITEM_${index}`,
            Count: index + 1,
          })),
        },
      }),
      match,
      target,
    )

    const { default: sharp } = await import('sharp')
    const metadata = await sharp(noInventory).metadata()
    const width = metadata.width
    const height = metadata.height
    if (!width || !height) throw new Error('expected killbot card dimensions')
    const stripHeight = 18
    const extractBottomStrip = async (png: Uint8Array) =>
      sharp(png)
        .ensureAlpha()
        .extract({ left: 0, top: height - stripHeight, width, height: stripHeight })
        .raw()
        .toBuffer()
    const [emptyStrip, filledStrip] = await Promise.all([
      extractBottomStrip(noInventory),
      extractBottomStrip(manyInventory),
    ])
    const differingBytes = filledStrip.reduce(
      (count, value, index) => count + (value === emptyStrip[index] ? 0 : 1),
      0,
    )

    expect(differingBytes).toBeLessThanOrEqual(16)
  })
})
