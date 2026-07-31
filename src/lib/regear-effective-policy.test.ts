import { describe, expect, it } from 'vitest'
import {
  diffEffectiveRegearPolicies,
  parseRegearPolicyConfigSnapshot,
  resolveEffectiveRegearPolicy,
  type EffectiveRegearParticipantInput,
  type RegearPolicyConfigSnapshot,
} from './regear-effective-policy'

const participant: EffectiveRegearParticipantInput = {
  discordId: 'member-1',
  username: 'Member One',
  roleName: 'EngageDps',
  memberRoleIds: ['discord-role-1', 'rate-floor-role'],
  rolesUnavailable: false,
  manualExcluded: false,
  autoExcluded: false,
}

function config(
  patch: Partial<RegearPolicyConfigSnapshot> = {},
): RegearPolicyConfigSnapshot {
  return {
    version: 1,
    policyVersionId: '11111111-1111-4111-8111-111111111111',
    scope: 'event',
    capturedAt: '2026-07-29T00:00:00.000Z',
    guildId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    event: {
      category: '전투',
      policy: 'role',
      silverCap: null,
      maxDeathsPerMember: 2,
      videoPolicy: 'custom',
      videoPayoutRatePercent: 100,
      videoClaimCeilingBonusSilver: 200_000,
      videoRateAppliesWithoutProof: false,
      autoPolicy: 'inherit',
    },
    guild: {
      basePayoutRatePercent: 70,
      videoPayoutRatePercent: 100,
      videoClaimCeilingBonusSilver: 100_000,
      maxDeathsPerMember: 1,
    },
    roleRewards: [
      {
        roleName: 'EngageDps',
        silver: 1_000_000,
        payoutRatePercent: 80,
      },
    ],
    roleOverrides: [],
    discordRolePolicy: {
      enabled: false,
      policies: [],
    },
    discordRoleRateFloors: [],
    freeWindow: null,
    ...patch,
  }
}

describe('effective regear policy', () => {
  it('resolves event overrides above Discord roles and role defaults in one resolver', () => {
    const resolved = resolveEffectiveRegearPolicy(
      config({
        roleOverrides: [
          {
            roleName: 'EngageDps',
            enabled: true,
            silverCap: 700_000,
            payoutRatePercent: 95,
          },
        ],
        discordRolePolicy: {
          enabled: true,
          policies: [
            {
              discordRoleId: 'discord-role-1',
              discordRoleName: 'Veteran DPS',
              roleGroup: 'dps',
              silverCap: 800_000,
              payoutRatePercent: 90,
            },
          ],
        },
      }),
      participant,
    )

    expect(resolved.manual.snapshot.baseCapSilver).toBe(700_000)
    expect(resolved.manual.snapshot.basePayoutRatePercent).toBe(95)
    expect(resolved.manual.snapshot.sources).toMatchObject({
      cap: 'event_role_override',
      payoutRate: 'event_role_override',
      video: 'event',
    })
    expect(resolved.explanation.discordRolePolicy).toMatchObject({
      matchStatus: 'matched',
      matchedDiscordRoleId: 'discord-role-1',
    })
  })

  it('uses a Discord role policy and a higher Discord rate floor when no event override exists', () => {
    const resolved = resolveEffectiveRegearPolicy(
      config({
        discordRolePolicy: {
          enabled: true,
          policies: [
            {
              discordRoleId: 'discord-role-1',
              discordRoleName: 'Veteran DPS',
              roleGroup: 'dps',
              silverCap: 800_000,
              payoutRatePercent: 90,
            },
          ],
        },
        discordRoleRateFloors: [
          {
            id: 'floor-1',
            discordRoleId: 'rate-floor-role',
            discordRoleName: 'Core',
            minimumPayoutRatePercent: 110,
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
        ],
      }),
      participant,
    )

    expect(resolved.manual.snapshot.baseCapSilver).toBe(800_000)
    expect(resolved.manual.snapshot.basePayoutRatePercent).toBe(110)
    expect(resolved.manual.snapshot.sources.cap).toBe('discord_role_policy')
    expect(resolved.manual.snapshot.sources.payoutRate).toBe(
      'discord_role_rate_floor',
    )
  })

  it('keeps manual review available while blocking auto creation for a zero-cap Discord policy', () => {
    const resolved = resolveEffectiveRegearPolicy(
      config({
        discordRolePolicy: {
          enabled: true,
          policies: [
            {
              discordRoleId: 'discord-role-1',
              discordRoleName: 'Review Only',
              roleGroup: 'dps',
              silverCap: 0,
              payoutRatePercent: null,
            },
          ],
        },
      }),
      participant,
    )

    expect(resolved.manual.snapshot.enabled).toBe(true)
    expect(resolved.manual.snapshot.baseCapSilver).toBe(0)
    expect(resolved.auto.snapshot.enabled).toBe(false)
    expect(resolved.auto.snapshot.flow).toBe('auto')
  })

  it('uses role defaults for a guest while keeping every automatic flow disabled', () => {
    const resolved = resolveEffectiveRegearPolicy(
      config({
        discordRolePolicy: {
          enabled: true,
          policies: [
            {
              discordRoleId: 'guest-cannot-have-this-role',
              discordRoleName: 'Discord-only cap',
              roleGroup: 'dps',
              silverCap: 100,
              payoutRatePercent: 10,
            },
          ],
        },
      }),
      {
        ...participant,
        discordId: 'guest_00000000-0000-4000-8000-000000000001',
        memberRoleIds: [],
        bypassDiscordRolePolicy: true,
        autoExcluded: true,
      },
    )

    expect(resolved.manual.snapshot.enabled).toBe(true)
    expect(resolved.manual.snapshot.baseCapSilver).toBe(1_000_000)
    expect(resolved.manual.snapshot.basePayoutRatePercent).toBe(80)
    expect(resolved.explanation.discordRolePolicy).toMatchObject({
      enabled: false,
      matchStatus: 'disabled',
    })
    expect(resolved.auto.snapshot.enabled).toBe(false)
    expect(resolved.auto.snapshot.disabledReason).toBe('slot_excluded')
  })

  it('records policy changes without treating a new preview version id as a change', () => {
    const beforeConfig = config()
    const afterConfig = config({
      policyVersionId: '22222222-2222-4222-8222-222222222222',
      roleOverrides: [
        {
          roleName: 'EngageDps',
          enabled: true,
          silverCap: 650_000,
          payoutRatePercent: 90,
        },
      ],
    })
    const before = resolveEffectiveRegearPolicy(beforeConfig, participant)
    const after = resolveEffectiveRegearPolicy(afterConfig, participant)

    expect(diffEffectiveRegearPolicies([before], [before])).toEqual([])
    expect(diffEffectiveRegearPolicies([before], [after])).toEqual([
      expect.objectContaining({
        discordId: 'member-1',
        roleName: 'EngageDps',
        changed: expect.arrayContaining(['silver_cap', 'payout_rate', 'source']),
      }),
    ])
  })

  it('keeps a free-window snapshot isolated from event overrides and freezes its own rate and limit', () => {
    const freeWindowConfig = config({
      scope: 'free_window',
      eventId: null,
      event: {
        ...config().event,
        maxDeathsPerMember: 20,
        autoPolicy: 'disabled',
      },
      roleOverrides: [
        {
          roleName: 'EngageDps',
          enabled: false,
          silverCap: null,
          payoutRatePercent: null,
        },
      ],
      freeWindow: {
        payoutRatePercent: 75,
        maxDeathsPerMember: 20,
      },
    })
    const resolved = resolveEffectiveRegearPolicy(freeWindowConfig, participant)

    expect(resolved.manual.snapshot.enabled).toBe(true)
    expect(resolved.manual.snapshot.baseCapSilver).toBe(1_000_000)
    expect(resolved.manual.snapshot.basePayoutRatePercent).toBe(75)
    expect(resolved.manual.snapshot.maxDeathsPerMember).toBe(20)
    expect(resolved.manual.snapshot.sources.payoutRate).toBe('regear_window')
    expect(resolved.auto.snapshot.enabled).toBe(false)
  })

  it('round-trips a valid config snapshot and rejects incomplete data', () => {
    const original = config()
    expect(parseRegearPolicyConfigSnapshot(original)).toEqual(original)
    expect(
      parseRegearPolicyConfigSnapshot({
        ...original,
        roleRewards: [{ roleName: '', silver: -1 }],
      }),
    ).toBeNull()
    expect(
      parseRegearPolicyConfigSnapshot({
        ...original,
        eventId: null,
      }),
    ).toBeNull()
  })
})
