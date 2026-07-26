import { describe, expect, it } from 'vitest'
import {
  applyRegearWindowPayoutRate,
  DEFAULT_EVENT_REGEAR_POLICY,
  EVENT_REGEAR_MAX_DEATHS_MAX,
  EVENT_REGEAR_MAX_DEATHS_MIN,
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  isEventRegearPolicy,
  parseRegearPolicySnapshot,
  resolveEventRegearPolicy,
  resolveManualRegearPolicy,
  resolveSnapshotPayoutRatePercent,
} from './regear-event-policy'

describe('event-level manual regear policy', () => {
  it('lets combat events use an event cap', () => {
    const resolved = resolveManualRegearPolicy({
      category: '전투',
      eventPolicy: 'event',
      eventSilverCap: 777_000,
      eventMaxDeathsPerMember: 2,
      roleSilver: 1_200_000,
      globalMaxDeaths: 1,
    })

    expect(resolved).toEqual({
      enabled: true,
      source: 'event',
      silverCap: 777_000,
      maxDeathsPerMember: 2,
    })
  })

  it('lets FF and ganking events replace the role cap with an event cap', () => {
    const resolved = resolveManualRegearPolicy({
      category: '갱킹',
      eventPolicy: 'event',
      eventSilverCap: 300_000,
      eventMaxDeathsPerMember: 3,
      roleSilver: 0,
      globalMaxDeaths: 1,
    })

    expect(resolved).toEqual({
      enabled: true,
      source: 'event',
      silverCap: 300_000,
      maxDeathsPerMember: 3,
    })
  })

  it('blocks manual regear when a non-combat event is set to disabled', () => {
    const resolved = resolveManualRegearPolicy({
      category: 'FF',
      eventPolicy: 'disabled',
      eventSilverCap: 300_000,
      eventMaxDeathsPerMember: 3,
      roleSilver: 900_000,
      globalMaxDeaths: 2,
    })

    expect(resolved).toEqual({
      enabled: false,
      source: 'disabled',
      silverCap: 0,
      maxDeathsPerMember: 2,
    })
  })

  it('falls back to role policy for unknown persisted policy values', () => {
    const resolved = resolveManualRegearPolicy({
      category: 'FF',
      eventPolicy: 'legacy-value',
      eventSilverCap: 100_000,
      eventMaxDeathsPerMember: 2,
      roleSilver: 500_000,
      globalMaxDeaths: 1,
    })

    expect(resolved.source).toBe(DEFAULT_EVENT_REGEAR_POLICY)
    expect(resolved.silverCap).toBe(500_000)
    expect(resolved.maxDeathsPerMember).toBe(1)
  })

  it('rejects invalid event caps by disabling the event policy result', () => {
    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MIN - 1,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MIN,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', silverCap: 0 })

    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MAX + 1,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MIN,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', silverCap: 0 })

    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MIN,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MAX + 1,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', maxDeathsPerMember: 1 })
  })

  it('narrows policy strings with the whitelist guard', () => {
    expect(isEventRegearPolicy('role')).toBe(true)
    expect(isEventRegearPolicy('event')).toBe(true)
    expect(isEventRegearPolicy('disabled')).toBe(true)
    expect(isEventRegearPolicy('all')).toBe(false)
  })

  it('resolves role overrides before role defaults and stores a snapshot', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 2,
      eventVideoPolicy: 'inherit',
      eventVideoPayoutRatePercent: null,
      eventVideoClaimCeilingBonusSilver: null,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_200_000,
      rolePayoutRatePercent: 80,
      discordRolePayoutRatePercent: 55,
      roleOverride: { enabled: true, silverCap: 900_000, payoutRatePercent: 70 },
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 500_000,
      globalMaxDeaths: 1,
      hasVideoProof: false,
      flow: 'manual',
    })

    expect(resolved.enabled).toBe(true)
    expect(resolved.baseSilverCap).toBe(900_000)
    expect(resolved.payoutRatePercent).toBe(70)
    expect(resolved.snapshot.sources.cap).toBe('event_role_override')
    expect(resolved.snapshot.sources.payoutRate).toBe('event_role_override')
  })

  it('keeps a role bonus rate above 100% in the policy snapshot', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'inherit',
      eventVideoPayoutRatePercent: null,
      eventVideoClaimCeilingBonusSilver: null,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 125,
      roleOverride: null,
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: false,
      flow: 'manual',
    })

    expect(resolved.payoutRatePercent).toBe(125)
    expect(parseRegearPolicySnapshot(resolved.snapshot)?.basePayoutRatePercent).toBe(125)
  })

  it('does not let a video benefit reduce a role bonus rate', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'custom',
      eventVideoPayoutRatePercent: 100,
      eventVideoClaimCeilingBonusSilver: 0,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 125,
      roleOverride: null,
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: true,
      flow: 'manual',
    })

    expect(resolved.payoutRatePercent).toBe(125)
    expect(resolveSnapshotPayoutRatePercent(resolved.snapshot, true, 100)).toBe(125)
  })

  it('keeps the role payout rate when inherited guild video rate is higher', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'inherit',
      eventVideoPayoutRatePercent: null,
      eventVideoClaimCeilingBonusSilver: null,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 55,
      roleOverride: null,
      guildBasePayoutRatePercent: 70,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: true,
      flow: 'manual',
    })

    expect(resolved.payoutRatePercent).toBe(55)
    expect(resolved.videoPayoutRatePercent).toBe(55)
    expect(resolveSnapshotPayoutRatePercent(resolved.snapshot, true, 100)).toBe(55)
  })

  it('uses the matched Discord role payout rate before the normal role rate', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'inherit',
      eventVideoPayoutRatePercent: null,
      eventVideoClaimCeilingBonusSilver: null,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 80,
      discordRolePayoutRatePercent: 55,
      roleOverride: null,
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: false,
      flow: 'manual',
    })

    expect(resolved.payoutRatePercent).toBe(55)
    expect(resolved.snapshot.sources.payoutRate).toBe('discord_role_policy')
  })

  it('uses event video custom values in snapshot payout resolution', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'custom',
      eventVideoPayoutRatePercent: 95,
      eventVideoClaimCeilingBonusSilver: 300_000,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 75,
      discordRolePayoutRatePercent: 55,
      roleOverride: null,
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: true,
      flow: 'manual',
    })
    const snapshot = parseRegearPolicySnapshot(resolved.snapshot)

    expect(resolved.silverCap).toBe(1_300_000)
    expect(resolved.payoutRatePercent).toBe(95)
    expect(resolveSnapshotPayoutRatePercent(snapshot, true, 100)).toBe(95)
    expect(resolveSnapshotPayoutRatePercent(snapshot, false, 100)).toBe(55)
  })

  it('can apply the configured video rate without proof while keeping the cap bonus proof-gated', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'custom',
      eventVideoPayoutRatePercent: 95,
      eventVideoClaimCeilingBonusSilver: 300_000,
      eventVideoRateAppliesWithoutProof: true,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 75,
      roleOverride: null,
      guildBasePayoutRatePercent: 100,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 0,
      globalMaxDeaths: 1,
      hasVideoProof: false,
      flow: 'manual',
    })
    const snapshot = parseRegearPolicySnapshot(resolved.snapshot)

    expect(resolved.silverCap).toBe(1_000_000)
    expect(resolved.payoutRatePercent).toBe(95)
    expect(resolved.videoRateAppliesWithoutProof).toBe(true)
    expect(resolveSnapshotPayoutRatePercent(snapshot, false, 75)).toBe(95)
  })

  it('pins a free regear window rate for requests with and without video proof', () => {
    const resolved = resolveEventRegearPolicy({
      category: '전투',
      eventPolicy: 'role',
      eventSilverCap: null,
      eventMaxDeathsPerMember: 1,
      eventVideoPolicy: 'inherit',
      eventVideoPayoutRatePercent: null,
      eventVideoClaimCeilingBonusSilver: null,
      eventVideoRateAppliesWithoutProof: false,
      eventAutoPolicy: 'inherit',
      roleSilver: 1_000_000,
      rolePayoutRatePercent: 125,
      guildBasePayoutRatePercent: 80,
      guildVideoPayoutRatePercent: 100,
      guildVideoClaimCeilingBonusSilver: 300_000,
      globalMaxDeaths: 1,
      hasVideoProof: true,
      flow: 'manual',
    })

    const snapshot = applyRegearWindowPayoutRate(resolved.snapshot, 65)

    expect(snapshot.sources.payoutRate).toBe('regear_window')
    expect(resolveSnapshotPayoutRatePercent(snapshot, false, 100)).toBe(65)
    expect(resolveSnapshotPayoutRatePercent(snapshot, true, 100)).toBe(65)
    expect(snapshot.videoClaimCeilingBonusSilver).toBe(300_000)
  })
})
