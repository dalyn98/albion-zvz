import { describe, expect, it } from 'vitest'
import {
  buildKillbotDiscordPayload,
  classifyKillbotEvent,
  type AlbionKillbotEvent,
  type KillbotConfig,
  type KillbotTarget,
} from './killbot'

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

describe('buildKillbotDiscordPayload', () => {
  it('builds one Discord embed per kill with the kill details in the same card', () => {
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
    if (!('fields' in mainEmbed)) throw new Error('expected main embed fields')
    expect(mainEmbed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Battle', value: '[77](https://albiononline.com/killboard/battles/77)' }),
        expect.objectContaining({ name: 'Participants', value: 'Assistant' }),
        expect.objectContaining({ name: 'Victim build', value: expect.stringContaining('Weapon:') }),
      ]),
    )
  })
})
