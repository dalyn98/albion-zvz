import type {
  EventCategory,
  EventRegearAutoPolicy,
  EventRegearPolicy,
  EventRegearVideoPolicy,
} from '@/types'
import {
  applyRegearWindowPayoutRate,
  isEventRegearAutoPolicy,
  isEventRegearPolicy,
  isEventRegearVideoPolicy,
  isValidEventRegearMaxDeaths,
  isValidEventRegearRolePayoutRate,
  isValidEventRegearSilverCap,
  isValidEventRegearVideoBonus,
  resolveEventRegearPolicy,
  type EventRegearRoleOverrideInput,
  type RegearPolicyFlow,
  type RegearPolicySnapshot,
  type ResolvedEventRegearPolicy,
} from '@/lib/regear-event-policy'
import {
  resolveRegearRolePolicy,
  roleGroupFromSlotRole,
  type RegearRoleGroup,
  type RegearRolePolicyResolution,
  type RegearRolePolicyRow,
} from '@/lib/regear-role-policy'
import {
  resolveRegearDiscordRoleRateFloor,
  toRegearDiscordRoleRateFloorSnapshot,
  type RegearDiscordRoleRateFloor,
} from '@/lib/regear-role-rate-floor'

export const REGEAR_POLICY_CONFIG_SNAPSHOT_VERSION = 1 as const

export interface RegearPolicyRoleRewardInput {
  roleName: string
  silver: number
  payoutRatePercent: number | null
}

export interface RegearPolicyRoleOverrideInput extends EventRegearRoleOverrideInput {
  roleName: string
}

export interface RegearPolicyDiscordRoleInput {
  id?: string
  discordRoleId: string
  discordRoleName: string
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number | null
}

export interface RegearPolicyConfigSnapshot {
  version: typeof REGEAR_POLICY_CONFIG_SNAPSHOT_VERSION
  policyVersionId: string
  scope: 'event' | 'free_window'
  capturedAt: string
  guildId: string
  eventId: string | null
  event: {
    category: EventCategory
    policy: EventRegearPolicy
    silverCap: number | null
    maxDeathsPerMember: number | null
    videoPolicy: EventRegearVideoPolicy
    videoPayoutRatePercent: number | null
    videoClaimCeilingBonusSilver: number | null
    videoRateAppliesWithoutProof: boolean
    autoPolicy: EventRegearAutoPolicy
  }
  guild: {
    basePayoutRatePercent: number
    videoPayoutRatePercent: number
    videoClaimCeilingBonusSilver: number
    maxDeathsPerMember: number
  }
  roleRewards: RegearPolicyRoleRewardInput[]
  roleOverrides: RegearPolicyRoleOverrideInput[]
  discordRolePolicy: {
    enabled: boolean
    policies: RegearPolicyDiscordRoleInput[]
  }
  discordRoleRateFloors: RegearDiscordRoleRateFloor[]
  freeWindow: {
    payoutRatePercent: number
    maxDeathsPerMember: number
  } | null
}

export interface EffectiveRegearParticipantInput {
  discordId: string
  username: string
  roleName: string
  memberRoleIds: string[]
  rolesUnavailable?: boolean
  bypassDiscordRolePolicy?: boolean
  manualExcluded?: boolean
  autoExcluded?: boolean
}

export interface EffectiveRegearPolicyExplanation {
  version: 1
  policyVersionId: string
  scope: 'event' | 'free_window'
  roleReward: RegearPolicyRoleRewardInput | null
  roleOverride: RegearPolicyRoleOverrideInput | null
  discordRolePolicy: {
    enabled: boolean
    matchStatus: RegearRolePolicyResolution['matchStatus']
    matchedDiscordRoleId: string | null
    matchedDiscordRoleName: string | null
  }
  discordRoleRateFloor: {
    discordRoleId: string
    discordRoleName: string
    minimumPayoutRatePercent: number
  } | null
}

export interface EffectiveRegearPolicyPair {
  participant: EffectiveRegearParticipantInput
  manual: ResolvedEventRegearPolicy
  auto: ResolvedEventRegearPolicy
  rolePolicy: RegearRolePolicyResolution
  explanation: EffectiveRegearPolicyExplanation
}

export interface EffectiveRegearPolicyDiff {
  discordId: string
  roleName: string
  changed: Array<
    | 'allowed'
    | 'silver_cap'
    | 'payout_rate'
    | 'max_deaths'
    | 'video'
    | 'source'
  >
  before: RegearPolicySnapshot
  after: RegearPolicySnapshot
}

function safePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : fallback
}

function roleRewardFor(
  config: RegearPolicyConfigSnapshot,
  roleName: string,
): RegearPolicyRoleRewardInput | null {
  return config.roleRewards.find((row) => row.roleName === roleName) ?? null
}

function roleOverrideFor(
  config: RegearPolicyConfigSnapshot,
  roleName: string,
): RegearPolicyRoleOverrideInput | null {
  return config.roleOverrides.find((row) => row.roleName === roleName) ?? null
}

function resolveOne(
  config: RegearPolicyConfigSnapshot,
  participant: EffectiveRegearParticipantInput,
  flow: RegearPolicyFlow,
  rolePolicy: RegearRolePolicyResolution,
  roleReward: RegearPolicyRoleRewardInput | null,
  roleOverride: RegearPolicyRoleOverrideInput | null,
  discordRoleRateFloor: ReturnType<typeof toRegearDiscordRoleRateFloorSnapshot>,
): ResolvedEventRegearPolicy {
  const event = config.event
  const globalMaxDeaths = config.freeWindow
    ? safePositiveInteger(config.freeWindow.maxDeathsPerMember, 1)
    : safePositiveInteger(config.guild.maxDeathsPerMember, 1)
  const resolved = resolveEventRegearPolicy({
    category: event.category,
    eventPolicy: event.policy,
    eventSilverCap: event.silverCap,
    eventMaxDeathsPerMember:
      config.freeWindow?.maxDeathsPerMember ?? event.maxDeathsPerMember,
    eventVideoPolicy: event.videoPolicy,
    eventVideoPayoutRatePercent: event.videoPayoutRatePercent,
    eventVideoClaimCeilingBonusSilver: event.videoClaimCeilingBonusSilver,
    eventVideoRateAppliesWithoutProof: event.videoRateAppliesWithoutProof,
    eventAutoPolicy: event.autoPolicy,
    roleSilver: roleReward?.silver ?? 0,
    rolePayoutRatePercent: roleReward?.payoutRatePercent ?? null,
    discordRolePolicy: rolePolicy,
    discordRoleRateFloor,
    useMaximumVideoPayoutRate: config.discordRoleRateFloors.length > 0,
    roleOverride,
    guildBasePayoutRatePercent: config.guild.basePayoutRatePercent,
    guildVideoPayoutRatePercent: config.guild.videoPayoutRatePercent,
    guildVideoClaimCeilingBonusSilver: config.guild.videoClaimCeilingBonusSilver,
    globalMaxDeaths,
    hasVideoProof: false,
    flow,
    excluded: flow === 'manual' ? participant.manualExcluded : participant.autoExcluded,
    policyContext: {
      policyVersionId: config.policyVersionId,
      scope: config.scope,
      capturedAt: config.capturedAt,
      discordId: participant.discordId,
      username: participant.username,
      roleName: participant.roleName,
    },
  })

  if (!config.freeWindow) return resolved
  const snapshot = applyRegearWindowPayoutRate(
    resolved.snapshot,
    config.freeWindow.payoutRatePercent,
  )
  return {
    ...resolved,
    basePayoutRatePercent: snapshot.basePayoutRatePercent,
    payoutRatePercent: snapshot.payoutRatePercent,
    videoPayoutRatePercent: snapshot.videoPayoutRatePercent,
    rateSource: snapshot.sources.payoutRate,
    snapshot,
  }
}

export function resolveEffectiveRegearPolicy(
  config: RegearPolicyConfigSnapshot,
  participant: EffectiveRegearParticipantInput,
): EffectiveRegearPolicyPair {
  const roleReward = roleRewardFor(config, participant.roleName)
  const roleOverride = config.scope === 'event'
    ? roleOverrideFor(config, participant.roleName)
    : null
  const policies: RegearRolePolicyRow[] = config.discordRolePolicy.policies.map((policy) => ({
    id: policy.id,
    discordRoleId: policy.discordRoleId,
    discordRoleName: policy.discordRoleName,
    roleGroup: policy.roleGroup,
    silverCap: policy.silverCap,
    payoutRatePercent: policy.payoutRatePercent,
  }))
  const rolePolicy = resolveRegearRolePolicy({
    enabled:
      config.discordRolePolicy.enabled &&
      participant.bypassDiscordRolePolicy !== true,
    roleGroup: roleGroupFromSlotRole(participant.roleName),
    fallbackSilverCap: roleReward?.silver ?? 0,
    memberRoleIds: participant.memberRoleIds,
    rolesUnavailable: participant.rolesUnavailable,
    policies,
  })
  const matchedRateFloor = resolveRegearDiscordRoleRateFloor(
    participant.memberRoleIds,
    config.discordRoleRateFloors,
  )
  const rateFloorSnapshot = toRegearDiscordRoleRateFloorSnapshot(matchedRateFloor)

  return {
    participant,
    manual: resolveOne(
      config,
      participant,
      'manual',
      rolePolicy,
      roleReward,
      roleOverride,
      rateFloorSnapshot,
    ),
    auto: resolveOne(
      config,
      participant,
      'auto',
      rolePolicy,
      roleReward,
      roleOverride,
      rateFloorSnapshot,
    ),
    rolePolicy,
    explanation: {
      version: 1,
      policyVersionId: config.policyVersionId,
      scope: config.scope,
      roleReward,
      roleOverride,
      discordRolePolicy: {
        enabled: rolePolicy.enabled,
        matchStatus: rolePolicy.matchStatus,
        matchedDiscordRoleId: rolePolicy.matchedPolicy?.discordRoleId ?? null,
        matchedDiscordRoleName: rolePolicy.matchedPolicy?.discordRoleName ?? null,
      },
      discordRoleRateFloor: rateFloorSnapshot,
    },
  }
}

export function diffEffectiveRegearPolicies(
  before: readonly EffectiveRegearPolicyPair[],
  after: readonly EffectiveRegearPolicyPair[],
): EffectiveRegearPolicyDiff[] {
  const beforeByParticipant = new Map(
    before.map((row) => [`${row.participant.discordId}\u0000${row.participant.roleName}`, row]),
  )
  const diffs: EffectiveRegearPolicyDiff[] = []
  for (const row of after) {
    const key = `${row.participant.discordId}\u0000${row.participant.roleName}`
    const previous = beforeByParticipant.get(key)
    if (!previous) continue
    const changed: EffectiveRegearPolicyDiff['changed'] = []
    if (previous.manual.enabled !== row.manual.enabled) changed.push('allowed')
    if (previous.manual.snapshot.baseCapSilver !== row.manual.snapshot.baseCapSilver) {
      changed.push('silver_cap')
    }
    if (
      previous.manual.snapshot.basePayoutRatePercent !==
      row.manual.snapshot.basePayoutRatePercent
    ) {
      changed.push('payout_rate')
    }
    if (
      previous.manual.snapshot.maxDeathsPerMember !==
      row.manual.snapshot.maxDeathsPerMember
    ) {
      changed.push('max_deaths')
    }
    if (
      previous.manual.snapshot.videoEnabled !== row.manual.snapshot.videoEnabled ||
      previous.manual.snapshot.videoPayoutRatePercent !==
        row.manual.snapshot.videoPayoutRatePercent ||
      previous.manual.snapshot.videoClaimCeilingBonusSilver !==
        row.manual.snapshot.videoClaimCeilingBonusSilver
    ) {
      changed.push('video')
    }
    if (
      previous.manual.snapshot.sources.cap !== row.manual.snapshot.sources.cap ||
      previous.manual.snapshot.sources.payoutRate !== row.manual.snapshot.sources.payoutRate ||
      previous.manual.snapshot.sources.video !== row.manual.snapshot.sources.video
    ) {
      changed.push('source')
    }
    if (changed.length > 0) {
      diffs.push({
        discordId: row.participant.discordId,
        roleName: row.participant.roleName,
        changed,
        before: previous.manual.snapshot,
        after: row.manual.snapshot,
      })
    }
  }
  return diffs
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function integerValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)
    ? value
    : null
}

function nullableIntegerValue(value: unknown): number | null | 'invalid' {
  if (value == null) return null
  return integerValue(value) ?? 'invalid'
}

function parseRoleRewards(value: unknown): RegearPolicyRoleRewardInput[] | null {
  if (!Array.isArray(value)) return null
  const rows: RegearPolicyRoleRewardInput[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const roleName = stringValue(row?.roleName)
    const silver = integerValue(row?.silver)
    const payoutRate = nullableIntegerValue(row?.payoutRatePercent)
    if (
      !row ||
      !roleName ||
      silver == null ||
      silver < 0 ||
      payoutRate === 'invalid' ||
      (payoutRate != null && !isValidEventRegearRolePayoutRate(payoutRate))
    ) {
      return null
    }
    rows.push({ roleName, silver, payoutRatePercent: payoutRate })
  }
  return rows
}

function parseRoleOverrides(value: unknown): RegearPolicyRoleOverrideInput[] | null {
  if (!Array.isArray(value)) return null
  const rows: RegearPolicyRoleOverrideInput[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const roleName = stringValue(row?.roleName)
    const silverCap = nullableIntegerValue(row?.silverCap)
    const payoutRate = nullableIntegerValue(row?.payoutRatePercent)
    if (
      !row ||
      !roleName ||
      silverCap === 'invalid' ||
      payoutRate === 'invalid' ||
      (silverCap != null && !isValidEventRegearSilverCap(silverCap)) ||
      (payoutRate != null && !isValidEventRegearRolePayoutRate(payoutRate))
    ) {
      return null
    }
    rows.push({
      roleName,
      enabled: row.enabled === true,
      silverCap,
      payoutRatePercent: payoutRate,
    })
  }
  return rows
}

const roleGroupSet: ReadonlySet<string> = new Set([
  'dps',
  'healer',
  'tank',
  'support',
  'battle_mount',
  'other',
])

function parseDiscordRolePolicies(value: unknown): RegearPolicyDiscordRoleInput[] | null {
  if (!Array.isArray(value)) return null
  const rows: RegearPolicyDiscordRoleInput[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const discordRoleId = stringValue(row?.discordRoleId)
    const discordRoleName = stringValue(row?.discordRoleName)
    const silverCap = integerValue(row?.silverCap)
    const payoutRate = nullableIntegerValue(row?.payoutRatePercent)
    const roleGroup =
      typeof row?.roleGroup === 'string' && roleGroupSet.has(row.roleGroup)
        ? (row.roleGroup as RegearRoleGroup)
        : null
    if (
      !row ||
      !discordRoleId ||
      !discordRoleName ||
      !roleGroup ||
      silverCap == null ||
      silverCap < 0 ||
      payoutRate === 'invalid' ||
      (payoutRate != null && !isValidEventRegearRolePayoutRate(payoutRate))
    ) {
      return null
    }
    rows.push({
      id: stringValue(row.id) ?? undefined,
      discordRoleId,
      discordRoleName,
      roleGroup,
      silverCap,
      payoutRatePercent: payoutRate,
    })
  }
  return rows
}

function parseRateFloors(value: unknown): RegearDiscordRoleRateFloor[] | null {
  if (!Array.isArray(value)) return null
  const rows: RegearDiscordRoleRateFloor[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const id = stringValue(row?.id)
    const discordRoleId = stringValue(row?.discordRoleId)
    const discordRoleName = stringValue(row?.discordRoleName)
    const minimum = integerValue(row?.minimumPayoutRatePercent)
    const updatedAt = stringValue(row?.updatedAt)
    if (
      !row ||
      !id ||
      !discordRoleId ||
      !discordRoleName ||
      !updatedAt ||
      minimum == null ||
      !isValidEventRegearRolePayoutRate(minimum)
    ) {
      return null
    }
    rows.push({
      id,
      discordRoleId,
      discordRoleName,
      minimumPayoutRatePercent: minimum,
      updatedAt,
    })
  }
  return rows
}

export function parseRegearPolicyConfigSnapshot(
  value: unknown,
): RegearPolicyConfigSnapshot | null {
  const root = asRecord(value)
  const event = asRecord(root?.event)
  const guild = asRecord(root?.guild)
  const discordRolePolicy = asRecord(root?.discordRolePolicy)
  if (
    !root ||
    root.version !== REGEAR_POLICY_CONFIG_SNAPSHOT_VERSION ||
    !event ||
    !guild ||
    !discordRolePolicy
  ) {
    return null
  }
  const policyVersionId = stringValue(root.policyVersionId)
  const capturedAt = stringValue(root.capturedAt)
  const guildId = stringValue(root.guildId)
  const eventId =
    root.eventId == null ? null : stringValue(root.eventId)
  const scope = root.scope === 'event' || root.scope === 'free_window' ? root.scope : null
  const category =
    event.category === '전투' || event.category === 'FF' || event.category === '갱킹'
      ? event.category
      : null
  const policy = isEventRegearPolicy(event.policy) ? event.policy : null
  const videoPolicy = isEventRegearVideoPolicy(event.videoPolicy)
    ? event.videoPolicy
    : null
  const autoPolicy = isEventRegearAutoPolicy(event.autoPolicy) ? event.autoPolicy : null
  const eventSilverCap = nullableIntegerValue(event.silverCap)
  const eventMaxDeaths = nullableIntegerValue(event.maxDeathsPerMember)
  const eventVideoRate = nullableIntegerValue(event.videoPayoutRatePercent)
  const eventVideoBonus = nullableIntegerValue(event.videoClaimCeilingBonusSilver)
  const guildBaseRate = integerValue(guild.basePayoutRatePercent)
  const guildVideoRate = integerValue(guild.videoPayoutRatePercent)
  const guildVideoBonus = integerValue(guild.videoClaimCeilingBonusSilver)
  const guildMaxDeaths = integerValue(guild.maxDeathsPerMember)
  const roleRewards = parseRoleRewards(root.roleRewards)
  const roleOverrides = parseRoleOverrides(root.roleOverrides)
  const discordPolicies = parseDiscordRolePolicies(discordRolePolicy.policies)
  const rateFloors = parseRateFloors(root.discordRoleRateFloors)
  if (
    !policyVersionId ||
    !capturedAt ||
    !guildId ||
    !scope ||
    (scope === 'event' && !eventId) ||
    (scope === 'free_window' && eventId !== null) ||
    !category ||
    !policy ||
    !videoPolicy ||
    !autoPolicy ||
    eventSilverCap === 'invalid' ||
    eventMaxDeaths === 'invalid' ||
    eventVideoRate === 'invalid' ||
    eventVideoBonus === 'invalid' ||
    (eventSilverCap != null && !isValidEventRegearSilverCap(eventSilverCap)) ||
    (eventMaxDeaths != null && !isValidEventRegearMaxDeaths(eventMaxDeaths)) ||
    (eventVideoRate != null && !isValidEventRegearRolePayoutRate(eventVideoRate)) ||
    (eventVideoBonus != null && !isValidEventRegearVideoBonus(eventVideoBonus)) ||
    guildBaseRate == null ||
    !isValidEventRegearRolePayoutRate(guildBaseRate) ||
    guildVideoRate == null ||
    !isValidEventRegearRolePayoutRate(guildVideoRate) ||
    guildVideoBonus == null ||
    !isValidEventRegearVideoBonus(guildVideoBonus) ||
    guildMaxDeaths == null ||
    !isValidEventRegearMaxDeaths(guildMaxDeaths) ||
    !roleRewards ||
    !roleOverrides ||
    !discordPolicies ||
    !rateFloors
  ) {
    return null
  }

  const freeWindowRow = root.freeWindow == null ? null : asRecord(root.freeWindow)
  let freeWindow: RegearPolicyConfigSnapshot['freeWindow'] = null
  if (scope === 'free_window') {
    const payoutRate = integerValue(freeWindowRow?.payoutRatePercent)
    const maxDeaths = integerValue(freeWindowRow?.maxDeathsPerMember)
    if (
      !freeWindowRow ||
      payoutRate == null ||
      !isValidEventRegearRolePayoutRate(payoutRate) ||
      maxDeaths == null ||
      maxDeaths < 1 ||
      maxDeaths > 20
    ) {
      return null
    }
    freeWindow = { payoutRatePercent: payoutRate, maxDeathsPerMember: maxDeaths }
  }

  return {
    version: REGEAR_POLICY_CONFIG_SNAPSHOT_VERSION,
    policyVersionId,
    scope,
    capturedAt,
    guildId,
    eventId,
    event: {
      category,
      policy,
      silverCap: eventSilverCap,
      maxDeathsPerMember: eventMaxDeaths,
      videoPolicy,
      videoPayoutRatePercent: eventVideoRate,
      videoClaimCeilingBonusSilver: eventVideoBonus,
      videoRateAppliesWithoutProof: event.videoRateAppliesWithoutProof === true,
      autoPolicy,
    },
    guild: {
      basePayoutRatePercent: guildBaseRate,
      videoPayoutRatePercent: guildVideoRate,
      videoClaimCeilingBonusSilver: guildVideoBonus,
      maxDeathsPerMember: guildMaxDeaths,
    },
    roleRewards,
    roleOverrides,
    discordRolePolicy: {
      enabled: discordRolePolicy.enabled === true,
      policies: discordPolicies,
    },
    discordRoleRateFloors: rateFloors,
    freeWindow,
  }
}
