import { describe, expect, it } from 'vitest'
import {
  resolveRegearDiscordRoleRateFloor,
  type RegearDiscordRoleRateFloor,
} from './regear-role-rate-floor'

function policy(
  discordRoleId: string,
  minimumPayoutRatePercent: number,
): RegearDiscordRoleRateFloor {
  return {
    id: discordRoleId,
    discordRoleId,
    discordRoleName: `Role ${discordRoleId}`,
    minimumPayoutRatePercent,
    updatedAt: '2026-07-28T00:00:00.000Z',
  }
}

describe('resolveRegearDiscordRoleRateFloor', () => {
  it('returns the highest minimum rate among matching Discord roles', () => {
    expect(
      resolveRegearDiscordRoleRateFloor(
        ['mentor', 'officer'],
        [policy('member', 80), policy('mentor', 110), policy('officer', 120)],
      )?.minimumPayoutRatePercent,
    ).toBe(120)
  })

  it('returns null when no configured role matches', () => {
    expect(
      resolveRegearDiscordRoleRateFloor(['member'], [policy('mentor', 110)]),
    ).toBeNull()
  })
})
