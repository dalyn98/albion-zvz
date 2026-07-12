import { describe, expect, it } from 'vitest'
import {
  isRegearRolePolicyZeroReview,
  resolveRegearRolePolicy,
  roleGroupFromSlotRole,
  type RegearRolePolicyRow,
} from './regear-role-policy'

const policies: RegearRolePolicyRow[] = [
  {
    discordRoleId: 'role-dps-low',
    discordRoleName: 'DPS Trial',
    roleGroup: 'dps',
    silverCap: 1_000_000,
    payoutRatePercent: 80,
  },
  {
    discordRoleId: 'role-dps-high',
    discordRoleName: 'DPS Core',
    roleGroup: 'dps',
    silverCap: 3_000_000,
    payoutRatePercent: 55,
  },
  {
    discordRoleId: 'role-healer',
    discordRoleName: 'Healer',
    roleGroup: 'healer',
    silverCap: 4_000_000,
    payoutRatePercent: 70,
  },
]

describe('regear Discord role policy', () => {
  it('maps engage and brawl dps into the same DPS role group', () => {
    expect(roleGroupFromSlotRole('EngageDps')).toBe('dps')
    expect(roleGroupFromSlotRole('BrawlerDps')).toBe('dps')
    expect(roleGroupFromSlotRole('Dps')).toBe('dps')
  })

  it('keeps the legacy cap when the policy is disabled', () => {
    expect(
      resolveRegearRolePolicy({
        enabled: false,
        roleGroup: 'dps',
        fallbackSilverCap: 2_000_000,
        memberRoleIds: ['role-dps-high'],
        policies,
      }),
    ).toMatchObject({
      silverCap: 2_000_000,
      matchStatus: 'disabled',
      matchedPolicy: null,
    })
  })

  it('uses the highest cap among matching Discord roles in the selected role group', () => {
    const resolved = resolveRegearRolePolicy({
      enabled: true,
      roleGroup: 'dps',
      fallbackSilverCap: 2_000_000,
      memberRoleIds: ['role-dps-low', 'role-dps-high', 'role-healer'],
      policies,
    })

    expect(resolved.matchStatus).toBe('matched')
    expect(resolved.silverCap).toBe(3_000_000)
    expect(resolved.payoutRatePercent).toBe(55)
    expect(resolved.matchedPolicy?.discordRoleId).toBe('role-dps-high')
  })

  it('ignores Discord roles that only match another regear role group', () => {
    expect(
      resolveRegearRolePolicy({
        enabled: true,
        roleGroup: 'dps',
        fallbackSilverCap: 2_000_000,
        memberRoleIds: ['role-healer'],
        policies,
      }),
    ).toMatchObject({
      silverCap: 0,
      matchStatus: 'no_match',
      matchedPolicy: null,
    })
  })

  it('marks role fetch failures as zero-cap admin review cases', () => {
    expect(
      resolveRegearRolePolicy({
        enabled: true,
        roleGroup: 'dps',
        fallbackSilverCap: 2_000_000,
        memberRoleIds: null,
        rolesUnavailable: true,
        policies,
      }),
    ).toMatchObject({
      silverCap: 0,
      matchStatus: 'roles_unavailable',
    })
  })

  it('identifies no-match and zero-cap matches as zero-silver review cases', () => {
    expect(
      isRegearRolePolicyZeroReview({
        enabled: true,
        matchStatus: 'no_match',
        silverCap: 0,
      }),
    ).toBe(true)
    expect(
      isRegearRolePolicyZeroReview({
        enabled: true,
        matchStatus: 'matched',
        silverCap: 0,
      }),
    ).toBe(true)
    expect(
      isRegearRolePolicyZeroReview({
        enabled: true,
        matchStatus: 'matched',
        silverCap: 1,
      }),
    ).toBe(false)
  })
})
