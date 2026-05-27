import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildKillbotDiscordMessage,
  buildKillbotDiscordPayload,
  classifyKillbotEvent,
  fetchRecentKillbotEvents,
  isKillbotEventInsideProcessWindow,
  type AlbionKillbotEvent,
  type KillbotConfig,
  type KillbotTarget,
} from './killbot'
import { KILLBOT_CARD_FONT_FILE } from './killbot-card'
import type { KillbotVictimValueEstimate } from './killbot-value'

afterEach(() => {
  vi.unstubAllGlobals()
})

const target: KillbotTarget = {
  server: 'east',
  homeGuildId: 'guild-home',
  homeGuildName: 'Menhera',
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
  minFame: 1,
  juicyFameThreshold: 1000,
  includeKills: true,
  includeDeaths: true,
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

describe('buildKillbotDiscordPayload', () => {
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
    expect(metadata).toMatchObject({ width: 920, height: 760, format: 'png' })
    expect(message.payload.embeds[0]?.image?.url).toBe('attachment://killbot-card.png')
    expect(message.payload.embeds[0]?.thumbnail).toBeUndefined()
  })
})

describe('killbot card font', () => {
  it('resolves the bundled card font used by sharp text rendering', () => {
    expect(KILLBOT_CARD_FONT_FILE).toMatch(/Geist-Regular\.ttf$/)
    expect(existsSync(KILLBOT_CARD_FONT_FILE)).toBe(true)
  })
})
