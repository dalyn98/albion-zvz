import { describe, expect, it } from 'vitest'
import {
  DEMO_GUILD_OBSERVED_WEAPON_USAGE,
  resolveDemoObservedWeaponUsage,
} from './observed-weapons'
import type { DemoKillEvent } from './kills'

function event(
  id: string,
  battleId: string,
  weapon: string,
): DemoKillEvent {
  return {
    id,
    battleId,
    type: 'kill',
    opponentName: 'Opponent',
    opponentGuild: 'Opponent Guild',
    weapon,
    zone: 'Mercia',
    time: { day: 'yesterday', time: '22:00' },
  }
}

describe('demo observed weapon usage', () => {
  it('counts one weapon family at most once per member battle', () => {
    const usage = resolveDemoObservedWeaponUsage([
      event('1', 'battle-1', 'Heavy Mace'),
      event('2', 'battle-1', 'Bedrock Mace'),
      event('3', 'battle-2', 'Morning Star'),
      event('4', 'battle-2', 'Brimstone Staff'),
      event('5', 'battle-3', 'Unknown Tool'),
    ])

    expect(usage).toEqual({
      source: 'killboard_equipment',
      windowDays: 30,
      sampleCount: 3,
      categories: [
        { weapon: 'mace', observationCount: 2 },
        { weapon: 'fire', observationCount: 1 },
      ],
    })
  })

  it('keeps the guild fixture independent from planned member weapons', () => {
    expect(
      DEMO_GUILD_OBSERVED_WEAPON_USAGE.categories.reduce(
        (sum, category) => sum + category.observationCount,
        0,
      ),
    ).toBe(DEMO_GUILD_OBSERVED_WEAPON_USAGE.sampleCount)
    expect(DEMO_GUILD_OBSERVED_WEAPON_USAGE.sampleCount).toBe(72)
  })
})
