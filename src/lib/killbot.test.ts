import { describe, expect, it } from 'vitest'
import { classifyKillbotEvent, type AlbionKillbotEvent, type KillbotTarget } from './killbot'

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
