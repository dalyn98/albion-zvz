import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppSetting } from '@/lib/app-settings'
import { listGuildMembersBulk } from '@/lib/discord'
import { log } from '@/lib/log'
import {
  diffEffectiveRegearPolicies,
  parseRegearPolicyConfigSnapshot,
  resolveEffectiveRegearPolicy,
  type EffectiveRegearPolicyDiff,
  type EffectiveRegearParticipantInput,
  type EffectiveRegearPolicyExplanation,
  type EffectiveRegearPolicyPair,
  type RegearPolicyConfigSnapshot,
  type RegearPolicyRoleOverrideInput,
} from '@/lib/regear-effective-policy'
import {
  isValidEventRegearMaxDeaths,
  isValidEventRegearRolePayoutRate,
  isValidEventRegearVideoBonus,
  parseRegearPolicySnapshot,
  type RegearPolicySnapshot,
} from '@/lib/regear-event-policy'
import {
  loadRegearDiscordRolePolicyConfig,
  loadRequesterDiscordRoleIds,
} from '@/lib/regear-role-policy-data'
import { loadRegearDiscordRoleRateFloorConfig } from '@/lib/regear-role-rate-floor-data'
import { getTenantDiscordConfig } from '@/lib/tenant'
import type {
  EventCategory,
  EventRegearAutoPolicy,
  EventRegearPolicy,
  EventRegearVideoPolicy,
} from '@/types'
import { isRegearSupported } from '@/lib/regear-support-server'
import { resolveStableMemberOwnership } from '@/lib/stable-member-ownership'

type DbClient = SupabaseClient

export interface EventRegearPolicyConfigRow {
  id: string
  category: EventCategory
  regear_policy: EventRegearPolicy
  regear_silver_cap: number | null
  regear_max_deaths_per_member: number | null
  regear_video_policy: EventRegearVideoPolicy
  regear_video_payout_rate_percent: number | null
  regear_video_claim_ceiling_bonus_silver: number | null
  regear_video_rate_applies_without_proof: boolean
  regear_auto_policy: EventRegearAutoPolicy
  guest_regear_enabled: boolean
  battle_started_at: string | null
  status: 'draft' | 'published'
  regear_policy_version_id: string | null
  regear_policy_config_snapshot: unknown
  regear_policy_snapshotted_at: string | null
}

export interface EventEffectiveRegearPolicyRow {
  id: string | null
  discordId: string
  username: string
  roleName: string
  policyVersionId: string
  manualPolicy: RegearPolicySnapshot
  autoPolicy: RegearPolicySnapshot
  sources: EffectiveRegearPolicyExplanation
  locked: boolean
}

export interface EventEffectiveRegearPolicyPreviewDiff
  extends EffectiveRegearPolicyDiff {
  username: string
}

interface EventSnapshotDbRow {
  id: string
  policy_version_id: string
  discord_id: string
  username: string
  role_name: string
  manual_policy_snapshot: unknown
  auto_policy_snapshot: unknown
  source_snapshot: unknown
}

interface ParticipantSeed {
  discordId: string
  username: string
  roleName: string
  manualExcluded: boolean
  autoExcluded: boolean
  isGuest: boolean
}

const EVENT_POLICY_SELECT =
  'id, category, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, guest_regear_enabled, battle_started_at, status, regear_policy_version_id, regear_policy_config_snapshot, regear_policy_snapshotted_at'

function normalizeStandardRate(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : fallback
}

function normalizeMaxDeaths(value: string, fallback: number): number {
  const parsed = Number(value)
  return isValidEventRegearMaxDeaths(parsed) ? parsed : fallback
}

function normalizeVideoBonus(value: string, fallback: number): number {
  const parsed = Number(value)
  return isValidEventRegearVideoBonus(parsed) ? parsed : fallback
}

async function loadGuildPolicyInputs(db: DbClient, guildId: string) {
  const [
    roleRewardsResult,
    rolePolicyConfig,
    rateFloorConfig,
    baseRateRaw,
    overchargeRateRaw,
    videoRateRaw,
    videoBonusRaw,
    maxDeathsRaw,
  ] = await Promise.all([
    db
      .from('role_rewards')
      .select('role_name, silver, payout_rate_percent')
      .eq('guild_id', guildId)
      .order('role_name'),
    loadRegearDiscordRolePolicyConfig(db as never, guildId),
    loadRegearDiscordRoleRateFloorConfig(db as never, guildId),
    getAppSetting('regear_payout_rate_percent', '100', guildId),
    getAppSetting('regear_overcharge_payout_rate_percent', '', guildId),
    getAppSetting('regear_video_payout_rate_percent', '100', guildId),
    getAppSetting('regear_video_claim_ceiling_bonus_silver', '0', guildId),
    getAppSetting('regear_max_deaths_per_event', '1', guildId),
  ])
  if (roleRewardsResult.error) throw new Error(roleRewardsResult.error.message)
  if (rolePolicyConfig.error) throw new Error(rolePolicyConfig.error)
  if (rateFloorConfig.error) throw new Error(rateFloorConfig.error)

  const basePayoutRatePercent = normalizeStandardRate(baseRateRaw, 100)
  return {
    roleRewards: (roleRewardsResult.data ?? []).map((row) => ({
      roleName: row.role_name as string,
      silver:
        typeof row.silver === 'number' && Number.isInteger(row.silver) && row.silver >= 0
          ? row.silver
          : 0,
      payoutRatePercent: isValidEventRegearRolePayoutRate(row.payout_rate_percent)
        ? row.payout_rate_percent
        : null,
    })),
    discordRolePolicy: {
      enabled: rolePolicyConfig.enabled,
      policies: rolePolicyConfig.policies.map((policy) => ({
        id: policy.id,
        discordRoleId: policy.discordRoleId,
        discordRoleName: policy.discordRoleName,
        roleGroup: policy.roleGroup,
        silverCap: policy.silverCap,
        payoutRatePercent: policy.payoutRatePercent,
      })),
    },
    discordRoleRateFloors: rateFloorConfig.policies,
    guild: {
      basePayoutRatePercent,
      overchargePayoutRatePercent: normalizeStandardRate(
        overchargeRateRaw,
        basePayoutRatePercent,
      ),
      videoPayoutRatePercent: normalizeStandardRate(videoRateRaw, 100),
      videoClaimCeilingBonusSilver: normalizeVideoBonus(videoBonusRaw, 0),
      maxDeathsPerMember: normalizeMaxDeaths(maxDeathsRaw, 1),
    },
  }
}

export async function captureEventRegearPolicyConfig(input: {
  db: DbClient
  guildId: string
  event: EventRegearPolicyConfigRow
  policyVersionId?: string
  capturedAt?: string
}): Promise<RegearPolicyConfigSnapshot> {
  const [guildInputs, overrideResult] = await Promise.all([
    loadGuildPolicyInputs(input.db, input.guildId),
    input.db
      .from('event_regear_role_overrides')
      .select('role_name, enabled, silver_cap, payout_rate_percent')
      .eq('guild_id', input.guildId)
      .eq('event_id', input.event.id)
      .order('role_name'),
  ])
  if (overrideResult.error) throw new Error(overrideResult.error.message)

  return {
    version: 1,
    policyVersionId: input.policyVersionId ?? randomUUID(),
    scope: 'event',
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    guildId: input.guildId,
    eventId: input.event.id,
    event: {
      category: input.event.category,
      policy: input.event.regear_policy,
      silverCap: input.event.regear_silver_cap,
      maxDeathsPerMember: input.event.regear_max_deaths_per_member,
      videoPolicy: input.event.regear_video_policy,
      videoPayoutRatePercent: input.event.regear_video_payout_rate_percent,
      videoClaimCeilingBonusSilver:
        input.event.regear_video_claim_ceiling_bonus_silver,
      videoRateAppliesWithoutProof:
        input.event.regear_video_rate_applies_without_proof === true,
      autoPolicy: input.event.regear_auto_policy,
    },
    guild: guildInputs.guild,
    roleRewards: guildInputs.roleRewards,
    roleOverrides: (overrideResult.data ?? []).map((row) => ({
      roleName: row.role_name as string,
      enabled: row.enabled === true,
      silverCap: typeof row.silver_cap === 'number' ? row.silver_cap : null,
      payoutRatePercent:
        typeof row.payout_rate_percent === 'number' ? row.payout_rate_percent : null,
    })),
    discordRolePolicy: guildInputs.discordRolePolicy,
    discordRoleRateFloors: guildInputs.discordRoleRateFloors,
    freeWindow: null,
  }
}

export async function captureFreeWindowRegearPolicyConfig(input: {
  db: DbClient
  guildId: string
  payoutRatePercent: number
  maxDeathsPerMember: number
  policyVersionId?: string
  capturedAt?: string
}): Promise<RegearPolicyConfigSnapshot> {
  const guildInputs = await loadGuildPolicyInputs(input.db, input.guildId)
  return {
    version: 1,
    policyVersionId: input.policyVersionId ?? randomUUID(),
    scope: 'free_window',
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    guildId: input.guildId,
    eventId: null,
    event: {
      category: '전투',
      policy: 'role',
      silverCap: null,
      maxDeathsPerMember: input.maxDeathsPerMember,
      videoPolicy: 'inherit',
      videoPayoutRatePercent: null,
      videoClaimCeilingBonusSilver: null,
      videoRateAppliesWithoutProof: false,
      autoPolicy: 'disabled',
    },
    guild: guildInputs.guild,
    roleRewards: guildInputs.roleRewards,
    roleOverrides: [],
    discordRolePolicy: guildInputs.discordRolePolicy,
    discordRoleRateFloors: guildInputs.discordRoleRateFloors,
    freeWindow: {
      payoutRatePercent: input.payoutRatePercent,
      maxDeathsPerMember: input.maxDeathsPerMember,
    },
  }
}

async function listEventParticipantSeeds(
  db: DbClient,
  guildId: string,
  eventId: string,
  category: EventCategory,
  guestRegearEnabled: boolean,
): Promise<ParticipantSeed[]> {
  const [slotResult, exceptionResult, guestResult] = await Promise.all([
    db
      .from('slots')
      .select(
        'assigned_discord_id, assigned_username, role_name, manual_regear_excluded, auto_regear_excluded, parties!inner(event_id)',
      )
      .eq('guild_id', guildId)
      .eq('parties.event_id', eventId)
      .not('assigned_discord_id', 'is', null),
    db
      .from('event_regear_participants')
      .select('discord_id, username, role_name')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .order('created_at'),
    db
      .from('event_guest_profiles')
      .select('discord_id')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
  ])
  if (slotResult.error) throw new Error(slotResult.error.message)
  if (exceptionResult.error) throw new Error(exceptionResult.error.message)
  if (guestResult.error) throw new Error(guestResult.error.message)

  const seeds = new Map<string, ParticipantSeed>()
  const guestIds = new Set(
    (guestResult.data ?? [])
      .map((row) => row.discord_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
  if (category === '전투') {
    for (const slot of slotResult.data ?? []) {
      const discordId =
        typeof slot.assigned_discord_id === 'string' ? slot.assigned_discord_id.trim() : ''
      const roleName = typeof slot.role_name === 'string' ? slot.role_name.trim() : ''
      if (!discordId || !roleName || seeds.has(discordId)) continue
      const isGuest = guestIds.has(discordId)
      seeds.set(discordId, {
        discordId,
        username:
          typeof slot.assigned_username === 'string' && slot.assigned_username.trim()
            ? slot.assigned_username.trim()
            : discordId,
        roleName,
        manualExcluded:
          slot.manual_regear_excluded === true ||
          (isGuest && !guestRegearEnabled),
        autoExcluded: slot.auto_regear_excluded === true || isGuest,
        isGuest,
      })
    }
  }
  for (const participant of exceptionResult.data ?? []) {
    const discordId =
      typeof participant.discord_id === 'string' ? participant.discord_id.trim() : ''
    const roleName =
      typeof participant.role_name === 'string' ? participant.role_name.trim() : ''
    if (!discordId || !roleName || seeds.has(discordId)) continue
    seeds.set(discordId, {
      discordId,
      username:
        typeof participant.username === 'string' && participant.username.trim()
          ? participant.username.trim()
          : discordId,
      roleName,
      manualExcluded: false,
      // Non-slot exception participants never become automatic regear targets.
      autoExcluded: true,
      isGuest: guestIds.has(discordId),
    })
  }
  return Array.from(seeds.values())
}

async function attachParticipantDiscordRoles(
  config: RegearPolicyConfigSnapshot,
  guildId: string,
  seeds: readonly ParticipantSeed[],
): Promise<EffectiveRegearParticipantInput[]> {
  const needsDiscordRoles =
    config.discordRolePolicy.enabled || config.discordRoleRateFloors.length > 0
  if (!needsDiscordRoles) {
    return seeds.map((seed) => ({
      ...seed,
      memberRoleIds: [],
      rolesUnavailable: false,
      bypassDiscordRolePolicy: seed.isGuest,
    }))
  }

  const roleIdsByMember = new Map<string, string[]>()
  let rolesUnavailable = false
  try {
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) {
      rolesUnavailable = true
    } else {
      const members = await listGuildMembersBulk(tenant.discordGuildId)
      for (const member of members) {
        if (member.user?.id) roleIdsByMember.set(member.user.id, member.roles ?? [])
      }
    }
  } catch (error) {
    rolesUnavailable = true
    log.error('[effective-regear-policy] Discord role snapshot failed', error, {
      tenant_id: guildId,
    })
  }

  return seeds.map((seed) => ({
    ...seed,
    memberRoleIds: seed.isGuest
      ? []
      : roleIdsByMember.get(seed.discordId) ?? [],
    rolesUnavailable:
      !seed.isGuest &&
      (rolesUnavailable || !roleIdsByMember.has(seed.discordId)),
    bypassDiscordRolePolicy: seed.isGuest,
  }))
}

async function resolveCurrentEventParticipants(
  db: DbClient,
  guildId: string,
  eventId: string,
  category: EventCategory,
  guestRegearEnabled: boolean,
  config: RegearPolicyConfigSnapshot,
): Promise<EffectiveRegearPolicyPair[]> {
  const seeds = await listEventParticipantSeeds(
    db,
    guildId,
    eventId,
    category,
    guestRegearEnabled,
  )
  const participants = await attachParticipantDiscordRoles(config, guildId, seeds)
  return participants.map((participant) => resolveEffectiveRegearPolicy(config, participant))
}

function pairToPayload(pair: EffectiveRegearPolicyPair) {
  return {
    policyVersionId: pair.manual.snapshot.policyVersionId,
    discordId: pair.participant.discordId,
    username: pair.participant.username,
    roleName: pair.participant.roleName,
    manualExcluded: pair.participant.manualExcluded === true,
    autoExcluded: pair.participant.autoExcluded === true,
    manualPolicy: pair.manual.snapshot,
    autoPolicy: pair.auto.snapshot,
    sources: pair.explanation,
  }
}

function pairToRow(pair: EffectiveRegearPolicyPair, locked: boolean): EventEffectiveRegearPolicyRow {
  return {
    id: null,
    discordId: pair.participant.discordId,
    username: pair.participant.username,
    roleName: pair.participant.roleName,
    policyVersionId: pair.explanation.policyVersionId,
    manualPolicy: pair.manual.snapshot,
    autoPolicy: pair.auto.snapshot,
    sources: pair.explanation,
    locked,
  }
}

function parseSourceSnapshot(
  value: unknown,
  fallback: {
    policyVersionId: string
    roleName: string
  },
): EffectiveRegearPolicyExplanation {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>
    const discordRolePolicy =
      row.discordRolePolicy &&
      typeof row.discordRolePolicy === 'object' &&
      !Array.isArray(row.discordRolePolicy)
        ? (row.discordRolePolicy as Record<string, unknown>)
        : null
    const matchStatus = discordRolePolicy?.matchStatus
    if (
      row.version === 1 &&
      row.policyVersionId === fallback.policyVersionId &&
      (row.scope === 'event' || row.scope === 'free_window') &&
      (
        matchStatus === 'disabled' ||
        matchStatus === 'matched' ||
        matchStatus === 'no_match' ||
        matchStatus === 'roles_unavailable'
      )
    ) {
      return {
        version: 1,
        policyVersionId: fallback.policyVersionId,
        scope: row.scope,
        roleReward:
          row.roleReward &&
          typeof row.roleReward === 'object' &&
          !Array.isArray(row.roleReward)
            ? (row.roleReward as EffectiveRegearPolicyExplanation['roleReward'])
            : null,
        roleOverride:
          row.roleOverride &&
          typeof row.roleOverride === 'object' &&
          !Array.isArray(row.roleOverride)
            ? (row.roleOverride as EffectiveRegearPolicyExplanation['roleOverride'])
            : null,
        discordRolePolicy: {
          enabled: discordRolePolicy?.enabled === true,
          matchStatus,
          matchedDiscordRoleId:
            typeof discordRolePolicy?.matchedDiscordRoleId === 'string'
              ? discordRolePolicy.matchedDiscordRoleId
              : null,
          matchedDiscordRoleName:
            typeof discordRolePolicy?.matchedDiscordRoleName === 'string'
              ? discordRolePolicy.matchedDiscordRoleName
              : null,
        },
        discordRoleRateFloor:
          row.discordRoleRateFloor &&
          typeof row.discordRoleRateFloor === 'object' &&
          !Array.isArray(row.discordRoleRateFloor)
            ? (row.discordRoleRateFloor as EffectiveRegearPolicyExplanation['discordRoleRateFloor'])
            : null,
      }
    }
  }
  return {
    version: 1,
    policyVersionId: fallback.policyVersionId,
    scope: 'event',
    roleReward: null,
    roleOverride: null,
    discordRolePolicy: {
      enabled: false,
      matchStatus: 'disabled',
      matchedDiscordRoleId: null,
      matchedDiscordRoleName: null,
    },
    discordRoleRateFloor: null,
  }
}

function mapStoredSnapshot(row: EventSnapshotDbRow): EventEffectiveRegearPolicyRow | null {
  const manualPolicy = parseRegearPolicySnapshot(row.manual_policy_snapshot)
  const autoPolicy = parseRegearPolicySnapshot(row.auto_policy_snapshot)
  if (!manualPolicy || !autoPolicy) return null
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    roleName: row.role_name,
    policyVersionId: row.policy_version_id,
    manualPolicy,
    autoPolicy,
    sources: parseSourceSnapshot(row.source_snapshot, {
      policyVersionId: row.policy_version_id,
      roleName: row.role_name,
    }),
    locked: true,
  }
}

async function readEventPolicyRow(
  db: DbClient,
  guildId: string,
  eventId: string,
): Promise<EventRegearPolicyConfigRow | null> {
  const { data, error } = await db
    .from('events')
    .select(EVENT_POLICY_SELECT)
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as EventRegearPolicyConfigRow | null
}

function matchingStoredEventConfig(
  event: EventRegearPolicyConfigRow,
  guildId: string,
  eventId: string,
): RegearPolicyConfigSnapshot | null {
  const config = parseRegearPolicyConfigSnapshot(
    event.regear_policy_config_snapshot,
  )
  if (
    !config ||
    config.scope !== 'event' ||
    config.guildId !== guildId ||
    config.eventId !== eventId ||
    (event.regear_policy_version_id !== null &&
      config.policyVersionId !== event.regear_policy_version_id)
  ) {
    return null
  }
  return config
}

export async function listEventEffectiveRegearPolicies(input: {
  db: DbClient
  guildId: string
  eventId: string
}): Promise<{
  config: RegearPolicyConfigSnapshot | null
  rows: EventEffectiveRegearPolicyRow[]
  locked: boolean
}> {
  const event = await readEventPolicyRow(input.db, input.guildId, input.eventId)
  if (!event) return { config: null, rows: [], locked: false }

  const storedConfig = matchingStoredEventConfig(
    event,
    input.guildId,
    input.eventId,
  )
  if (event.regear_policy_version_id) {
    const { data, error } = await input.db
      .from('event_regear_policy_snapshots')
      .select(
        'id, policy_version_id, discord_id, username, role_name, manual_policy_snapshot, auto_policy_snapshot, source_snapshot',
      )
      .eq('guild_id', input.guildId)
      .eq('event_id', input.eventId)
      .order('username')
    if (error) throw new Error(error.message)
    return {
      config: storedConfig,
      rows: ((data ?? []) as EventSnapshotDbRow[])
        .filter(
          (row) =>
            row.policy_version_id === event.regear_policy_version_id,
        )
        .map(mapStoredSnapshot)
        .filter((row): row is EventEffectiveRegearPolicyRow => row !== null),
      locked: true,
    }
  }

  const config = await captureEventRegearPolicyConfig({
    db: input.db,
    guildId: input.guildId,
    event,
  })
  const pairs = await resolveCurrentEventParticipants(
    input.db,
    input.guildId,
    input.eventId,
    event.category,
    event.guest_regear_enabled,
    config,
  )
  return {
    config,
    rows: pairs.map((pair) => pairToRow(pair, false)),
    locked: false,
  }
}

export async function previewEventRegearRoleOverrideDiff(input: {
  db: DbClient
  guildId: string
  eventId: string
  roleOverrides: RegearPolicyRoleOverrideInput[]
}): Promise<EventEffectiveRegearPolicyPreviewDiff[]> {
  const event = await readEventPolicyRow(input.db, input.guildId, input.eventId)
  if (!event) throw new Error('event_not_found')
  if (event.regear_policy_version_id) {
    throw new Error('event_regear_policy_locked')
  }

  const beforeConfig = await captureEventRegearPolicyConfig({
    db: input.db,
    guildId: input.guildId,
    event,
  })
  const seeds = await listEventParticipantSeeds(
    input.db,
    input.guildId,
    input.eventId,
    event.category,
    event.guest_regear_enabled,
  )
  const participants = await attachParticipantDiscordRoles(
    beforeConfig,
    input.guildId,
    seeds,
  )
  const before = participants.map((participant) =>
    resolveEffectiveRegearPolicy(beforeConfig, participant),
  )
  const afterConfig: RegearPolicyConfigSnapshot = {
    ...beforeConfig,
    roleOverrides: input.roleOverrides,
  }
  const after = participants.map((participant) =>
    resolveEffectiveRegearPolicy(afterConfig, participant),
  )
  const usernames = new Map(
    participants.map((participant) => [participant.discordId, participant.username]),
  )
  return diffEffectiveRegearPolicies(before, after).map((diff) => ({
    ...diff,
    username: usernames.get(diff.discordId) ?? diff.discordId,
  }))
}

export async function prepareEventEffectiveRegearPolicyStart(input: {
  db: DbClient
  guildId: string
  eventId: string
  startedAt: string
}): Promise<{
  policyVersionId: string
  policyConfigSnapshot: RegearPolicyConfigSnapshot
  participantSnapshots: Array<ReturnType<typeof pairToPayload>>
}> {
  // 웹, Discord, 자동 시작 cron이 모두 이 준비 함수를 거친다. 미지원 길드는
  // 시작 시점에 disabled 정책을 동결해 나중에 지원을 다시 켜더라도 과거
  // 이벤트가 소급해서 신청 가능 상태가 되지 않게 한다.
  if (!(await isRegearSupported(input.guildId))) {
    const { error } = await input.db
      .from('events')
      .update({
        regear_policy: 'disabled',
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        regear_video_policy: 'disabled',
        regear_video_payout_rate_percent: null,
        regear_video_claim_ceiling_bonus_silver: null,
        regear_video_rate_applies_without_proof: false,
        regear_auto_policy: 'disabled',
      })
      .eq('guild_id', input.guildId)
      .eq('id', input.eventId)
      .is('battle_started_at', null)
      .is('regear_policy_version_id', null)
    if (error) throw new Error(error.message)
  }
  const event = await readEventPolicyRow(input.db, input.guildId, input.eventId)
  if (!event) throw new Error('event_not_found')
  const existingConfig = matchingStoredEventConfig(
    event,
    input.guildId,
    input.eventId,
  )
  if (event.regear_policy_version_id && !existingConfig) {
    throw new Error('event_regear_policy_config_invalid')
  }
  const config = existingConfig ?? await captureEventRegearPolicyConfig({
    db: input.db,
    guildId: input.guildId,
    event,
    capturedAt: input.startedAt,
  })
  const pairs = await resolveCurrentEventParticipants(
    input.db,
    input.guildId,
    input.eventId,
    event.category,
    event.guest_regear_enabled,
    config,
  )
  return {
    policyVersionId: config.policyVersionId,
    policyConfigSnapshot: config,
    participantSnapshots: pairs.map(pairToPayload),
  }
}

export async function startEventWithEffectiveRegearPolicies(input: {
  db: DbClient
  guildId: string
  eventId: string
  startedAt: string
}): Promise<{
  startedAt: string
  policyVersionId: string
  participantSnapshotCount: number
}> {
  const prepared = await prepareEventEffectiveRegearPolicyStart(input)
  const { data, error } = await input.db.rpc('start_event_with_regear_policy_snapshots', {
    p_guild_id: input.guildId,
    p_event_id: input.eventId,
    p_started_at: input.startedAt,
    p_policy_version_id: prepared.policyVersionId,
    p_policy_config_snapshot: prepared.policyConfigSnapshot,
    p_participant_snapshots: prepared.participantSnapshots,
  })
  if (error) throw new Error(error.message)
  const result = data as {
    started_at?: string
    policy_version_id?: string
    participant_snapshot_count?: number
  } | null
  return {
    startedAt: result?.started_at ?? input.startedAt,
    policyVersionId: result?.policy_version_id ?? prepared.policyVersionId,
    participantSnapshotCount:
      result?.participant_snapshot_count ?? prepared.participantSnapshots.length,
  }
}

export async function loadEventParticipantEffectivePolicy(input: {
  db: DbClient
  guildId: string
  eventId: string
  discordId: string
}): Promise<EventEffectiveRegearPolicyRow | null> {
  const ownership = await resolveStableMemberOwnership(
    input.db,
    input.guildId,
    input.discordId,
  )
  let query = input.db
    .from('event_regear_policy_snapshots')
    .select(
      'id, policy_version_id, discord_id, username, role_name, manual_policy_snapshot, auto_policy_snapshot, source_snapshot',
    )
    .eq('guild_id', input.guildId)
    .eq('event_id', input.eventId)
  query = ownership.guildMemberId
    ? query.eq('guild_member_id', ownership.guildMemberId)
    : query.eq('discord_id', input.discordId)
  const { data, error } = await query
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapStoredSnapshot(data as EventSnapshotDbRow) : null
}

export async function getMemberEventEffectiveRegearPolicy(input: {
  db: DbClient
  guildId: string
  eventId: string
  discordId: string
}): Promise<EventEffectiveRegearPolicyRow | null> {
  const event = await readEventPolicyRow(input.db, input.guildId, input.eventId)
  if (!event) return null

  if (event.regear_policy_version_id) {
    // Once an event is frozen, a missing participant row must stay missing.
    // Re-resolving with current guild settings would silently defeat the
    // immutable start boundary.
    const stored = await loadEventParticipantEffectivePolicy(input)
    return stored?.policyVersionId === event.regear_policy_version_id
      ? stored
      : null
  }

  const seeds = await listEventParticipantSeeds(
    input.db,
    input.guildId,
    input.eventId,
    event.category,
    event.guest_regear_enabled,
  )
  const seed = seeds.find((candidate) => candidate.discordId === input.discordId)
  if (!seed) return null

  const config = await captureEventRegearPolicyConfig({
    db: input.db,
    guildId: input.guildId,
    event,
  })
  const [participant] = await attachParticipantDiscordRoles(
    config,
    input.guildId,
    [seed],
  )
  return pairToRow(
    resolveEffectiveRegearPolicy(config, participant),
    false,
  )
}

export async function resolveFreeWindowEffectivePolicy(input: {
  db: DbClient
  guildId: string
  config: RegearPolicyConfigSnapshot
  discordId: string
  username: string
  roleName: string
}): Promise<EffectiveRegearPolicyPair> {
  const needsDiscordRoles =
    input.config.discordRolePolicy.enabled ||
    input.config.discordRoleRateFloors.length > 0
  const memberRoles = needsDiscordRoles
    ? await loadRequesterDiscordRoleIds(input.guildId, input.discordId)
    : { roleIds: [], unavailable: false }
  return resolveEffectiveRegearPolicy(input.config, {
    discordId: input.discordId,
    username: input.username,
    roleName: input.roleName,
    memberRoleIds: memberRoles.roleIds,
    rolesUnavailable: memberRoles.unavailable,
    manualExcluded: false,
    autoExcluded: true,
  })
}

export async function addLateEventRegearParticipant(input: {
  db: DbClient
  guildId: string
  eventId: string
  discordId: string
  username: string
  roleName: string
  addedBy: string
  addedByUsername: string
}): Promise<string> {
  const event = await readEventPolicyRow(input.db, input.guildId, input.eventId)
  const config = event
    ? matchingStoredEventConfig(event, input.guildId, input.eventId)
    : null
  if (!event || !config || !event.battle_started_at) {
    throw new Error('event_regear_policy_not_frozen')
  }
  const { data: guestProfile, error: guestProfileError } = await input.db
    .from('event_guest_profiles')
    .select('discord_id')
    .eq('guild_id', input.guildId)
    .eq('event_id', input.eventId)
    .eq('discord_id', input.discordId)
    .maybeSingle()
  if (guestProfileError) throw new Error(guestProfileError.message)
  const isGuest = Boolean(guestProfile)
  const [participant] = await attachParticipantDiscordRoles(
    config,
    input.guildId,
    [{
      discordId: input.discordId,
      username: input.username,
      roleName: input.roleName,
      manualExcluded: isGuest && !event.guest_regear_enabled,
      autoExcluded: true,
      isGuest,
    }],
  )
  const pair = resolveEffectiveRegearPolicy(config, participant)
  const { data, error } = await input.db.rpc('add_event_regear_exception_participant', {
    p_guild_id: input.guildId,
    p_event_id: input.eventId,
    p_policy_version_id: config.policyVersionId,
    p_discord_id: input.discordId,
    p_username: input.username,
    p_role_name: input.roleName,
    p_added_by: input.addedBy,
    p_added_by_username: input.addedByUsername,
    p_manual_policy_snapshot: pair.manual.snapshot,
    p_auto_policy_snapshot: pair.auto.snapshot,
    p_source_snapshot: pair.explanation,
  })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new Error('event_regear_snapshot_insert_failed')
  return data
}
