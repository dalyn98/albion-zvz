import 'server-only'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { ephemeralReply, type DiscordInteractionOption, type DiscordInteractionResponse } from '@/lib/discord-interactions'
import type { DiscordCommandActor, DiscordCommandTenant } from '@/lib/discord-command-auth'
import {
  discordBattleOutcomeLabel,
  discordStatusLabel,
  formatDiscordCommandMessage,
  type DiscordCommandSuiteMessages,
} from '@/lib/discord-command-suite-messages'
import {
  DISCORD_COMMAND_UUID_PATTERN,
  formatDiscordTimestamp,
  formatNumber,
  integerOption,
  stringOption,
  webButton,
} from '@/lib/discord-command-suite-shared'
import {
  fetchMemberLeaderboardRollups,
  numberFromRollupValue,
  type MemberLeaderboardRollupRow,
} from '@/lib/member-leaderboard-rollups'
import { getCurrentWeekStartIso } from '@/lib/timezone'
import { claimCraftTask, collectCraftTask, deliverCraftTask, releaseCraftTask } from '@/lib/craft-tasks'
import { decrementBuildForDelivery } from '@/lib/inventory'
import { normalizeCraftRegearSlots } from '@/lib/regear-craft-slots'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import type { BuildSnapshot } from '@/types'
import { log } from '@/lib/log'

const ALL_WINDOW_MS = 730 * 24 * 60 * 60 * 1000
const MONTH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type StatsWindow = 'week' | 'month' | 'all'
type StatsMetric = 'kills' | 'participation' | 'survival' | 'kd' | 'winrate'

interface StatsMember {
  discordId: string
  username: string
  albionPlayerId: string
  kills: number
  deaths: number
  participations: number
  deathBattles: number
  wins: number
  losses: number
}

function statsWindow(options: readonly DiscordInteractionOption[]): StatsWindow {
  const value = stringOption(options, 'window')
  return value === 'month' || value === 'all' ? value : 'week'
}

function statsCutoff(window: StatsWindow): string {
  if (window === 'week') return getCurrentWeekStartIso()
  return new Date(Date.now() - (window === 'month' ? MONTH_WINDOW_MS : ALL_WINDOW_MS)).toISOString()
}

function statsWindowLabel(window: StatsWindow, messages: DiscordCommandSuiteMessages): string {
  if (window === 'month') return messages.windowMonth
  if (window === 'all') return messages.windowAll
  return messages.windowWeek
}

function statsMetricLabel(metric: StatsMetric, messages: DiscordCommandSuiteMessages): string {
  if (metric === 'participation') return messages.metricParticipation
  if (metric === 'survival') return messages.metricSurvival
  if (metric === 'kd') return messages.metricKd
  if (metric === 'winrate') return messages.metricWinrate
  return messages.metricKills
}

async function loadStatsMembers(guildId: string, window: StatsWindow): Promise<StatsMember[]> {
  const db = getAdminClient()
  const bundleSplits =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  const [{ data: avatars, error: avatarError }, rollups] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, username, albion_player_id')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .not('albion_player_id', 'is', null),
    fetchMemberLeaderboardRollups(db, guildId, statsCutoff(window), bundleSplits),
  ])
  if (avatarError) throw new Error(avatarError.message)
  if (!rollups) throw new Error('member_leaderboard_rollups unavailable')

  const metadata = new Map<string, { discordId: string; username: string }>()
  for (const avatar of avatars ?? []) {
    if (!avatar.albion_player_id || !avatar.discord_id) continue
    metadata.set(avatar.albion_player_id as string, {
      discordId: avatar.discord_id as string,
      username: (avatar.username as string | null) || `<@${avatar.discord_id}>`,
    })
  }
  return rollups.flatMap((row: MemberLeaderboardRollupRow): StatsMember[] => {
    if (!row.albion_player_id) return []
    const meta = metadata.get(row.albion_player_id)
    if (!meta) return []
    return [{
      ...meta,
      albionPlayerId: row.albion_player_id,
      kills: numberFromRollupValue(row.kills),
      deaths: numberFromRollupValue(row.deaths),
      participations: numberFromRollupValue(row.participations),
      deathBattles: numberFromRollupValue(row.death_battles),
      wins: numberFromRollupValue(row.wins),
      losses: numberFromRollupValue(row.losses),
    }]
  })
}

function memberStatsLines(
  member: StatsMember,
  messages: DiscordCommandSuiteMessages,
): string[] {
  const evaluated = member.wins + member.losses
  const survival = member.participations > 0
    ? Math.round(((member.participations - member.deathBattles) / member.participations) * 100)
    : 0
  const kd = member.deaths === 0 ? member.kills : member.kills / member.deaths
  const winRate = evaluated > 0 ? Math.round((member.wins / evaluated) * 100) : 0
  return [
    formatDiscordCommandMessage(messages.statsCombatLine, {
      kills: formatNumber(member.kills),
      deaths: formatNumber(member.deaths),
      kd: kd.toFixed(2),
    }),
    formatDiscordCommandMessage(messages.statsBattleLine, {
      battles: formatNumber(member.participations),
      survival,
    }),
    formatDiscordCommandMessage(messages.statsOutcomeLine, {
      wins: formatNumber(member.wins),
      losses: formatNumber(member.losses),
      winrate: winRate,
    }),
  ]
}

export async function handleMemberStats(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  targetDiscordId: string | null,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  if (!targetDiscordId) return ephemeralReply(messages.invalidInput)
  const window = statsWindow(options)
  const members = await loadStatsMembers(tenant.id, window)
  const member = members.find((entry) => entry.discordId === targetDiscordId)
  if (!member) return ephemeralReply(messages.noResults)
  return ephemeralReply([
    formatDiscordCommandMessage(messages.statsTitle, {
      member: member.username,
      window: statsWindowLabel(window, messages),
    }),
    ...memberStatsLines(member, messages),
  ].join('\n'), {
    components: await webButton(
      tenant,
      actor.discordId,
      targetDiscordId === actor.discordId ? '/me' : `/members/${targetDiscordId}`,
      messages.openWeb,
    ),
  })
}

function metricValue(member: StatsMember, metric: StatsMetric): number {
  if (metric === 'kills') return member.kills
  if (metric === 'participation') return member.participations
  if (metric === 'survival') {
    return member.participations >= 5
      ? ((member.participations - member.deathBattles) / member.participations) * 100
      : -1
  }
  if (metric === 'kd') {
    return member.kills + member.deaths >= 5 && member.kills > 0
      ? member.deaths === 0 ? member.kills : member.kills / member.deaths
      : -1
  }
  const evaluated = member.wins + member.losses
  return evaluated >= 5 ? (member.wins / evaluated) * 100 : -1
}

export async function handleLeaderboard(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const metricRaw = stringOption(options, 'metric')
  const metric: StatsMetric | null =
    metricRaw === 'kills' || metricRaw === 'participation' || metricRaw === 'survival' ||
    metricRaw === 'kd' || metricRaw === 'winrate'
      ? metricRaw
      : null
  if (!metric) return ephemeralReply(messages.invalidInput)
  const window = statsWindow(options)
  const ranked = (await loadStatsMembers(tenant.id, window))
    .map((member) => ({ member, value: metricValue(member, metric) }))
    .filter((entry) => entry.value >= 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  const lines = ranked.map((entry, index) => {
    const display = metric === 'kd'
      ? entry.value.toFixed(2)
      : metric === 'survival' || metric === 'winrate'
        ? `${Math.round(entry.value)}%`
        : formatNumber(Math.round(entry.value))
    return `${index + 1}. **${entry.member.username}** · ${display}`
  })
  return ephemeralReply([
    formatDiscordCommandMessage(messages.leaderboardTitle, {
      window: statsWindowLabel(window, messages),
      metric: statsMetricLabel(metric, messages),
    }),
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/leaderboard', messages.openWeb),
  })
}

export async function handleBattleStats(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const viewId = stringOption(options, 'battle')
  if (!viewId || !DISCORD_COMMAND_UUID_PATTERN.test(viewId)) {
    return ephemeralReply(messages.invalidInput)
  }
  const { data, error } = await getAdminClient()
    .from('guild_battle_views')
    .select('id, albion_battle_id, cluster_name, started_at, result_estimate, legacy_row_outcome, legacy_outcome, subject_name, subject_team_size, subject_kills, subject_deaths, subject_kill_fame, opponent_force_name, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame')
    .eq('tenant_id', tenant.id)
    .eq('id', viewId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return ephemeralReply(messages.noResults)
  const outcome = discordBattleOutcomeLabel(
    data.legacy_row_outcome ?? data.legacy_outcome ?? data.result_estimate,
    messages,
  )
  return ephemeralReply([
    formatDiscordCommandMessage(messages.battleTitle, {
      battle: data.albion_battle_id,
      outcome,
    }),
    `${data.cluster_name ?? '-'} · ${formatDiscordTimestamp(data.started_at)}`,
    formatDiscordCommandMessage(messages.battleTeamLine, {
      name: data.subject_name ?? tenant.name,
      players: data.subject_team_size,
      kills: data.subject_kills,
      deaths: data.subject_deaths,
      fame: formatNumber(Number(data.subject_kill_fame ?? 0)),
    }),
    formatDiscordCommandMessage(messages.battleTeamLine, {
      name: data.opponent_force_name ?? '-',
      players: data.opponent_team_size,
      kills: data.opponent_kills,
      deaths: data.opponent_deaths,
      fame: formatNumber(Number(data.opponent_kill_fame ?? 0)),
    }),
  ].join('\n'), {
    components: await webButton(
      tenant,
      actor.discordId,
      `/battles/${data.id}`,
      messages.openWeb,
    ),
  })
}

export async function handleRegearStatus(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const { data, error } = await getAdminClient()
    .from('regear_requests')
    .select('id, event_title_snapshot, role_name, status, payout_silver, claimed_silver, created_at')
    .eq('guild_id', tenant.id)
    .eq('discord_id', actor.discordId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  const lines = (data ?? []).map((row) => {
    const silver = Number(row.payout_silver ?? row.claimed_silver ?? 0)
    return formatDiscordCommandMessage(messages.regearStatusLine, {
      when: formatDiscordTimestamp(row.created_at),
      event: row.event_title_snapshot ?? '-',
      role: row.role_name ?? '-',
      status: discordStatusLabel(row.status, messages),
      silver: formatNumber(silver),
    })
  })
  return ephemeralReply([
    messages.regearStatusTitle,
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/regear', messages.openWeb),
  })
}

interface CraftProfile {
  isCrafter: boolean
  compensationMode: 'volunteer' | 'paid'
  premiumPct: number
}

export async function loadCraftProfile(actor: DiscordCommandActor): Promise<CraftProfile> {
  const { data } = await getAdminClient()
    .from('guild_avatars')
    .select('is_crafter, craft_compensation_mode, craft_premium_pct')
    .eq('guild_id', actor.guildId)
    .eq('discord_id', actor.discordId)
    .maybeSingle()
  return {
    isCrafter: data?.is_crafter === true,
    compensationMode: data?.craft_compensation_mode === 'paid' ? 'paid' : 'volunteer',
    premiumPct: Number.isInteger(data?.craft_premium_pct) ? Number(data?.craft_premium_pct) : 0,
  }
}

export async function handleCraftList(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  scope: 'queue' | 'mine',
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const profile = await loadCraftProfile(actor)
  if (!profile.isCrafter && !actor.isAdmin) return ephemeralReply(messages.crafterOnly)
  let query = getAdminClient()
    .from('craft_tasks')
    .select('id, status, created_at, crafter_discord_id, regear_requests!inner(username, event_title_snapshot, role_name)')
    .eq('guild_id', tenant.id)
    .eq('status', scope === 'queue' ? 'queued' : 'claimed')
    .order('created_at', { ascending: true })
    .limit(10)
  if (scope === 'mine') query = query.eq('crafter_discord_id', actor.discordId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const lines = (data ?? []).map((row) => {
    const request = Array.isArray(row.regear_requests)
      ? row.regear_requests[0]
      : row.regear_requests
    return `\`${String(row.id).slice(0, 8)}\` · **${request?.event_title_snapshot ?? '-'}** · ${request?.role_name ?? '-'} · ${request?.username ?? '-'}`
  })
  return ephemeralReply([
    scope === 'queue' ? messages.craftQueueTitle : messages.craftMineTitle,
    ...(lines.length ? lines : [messages.noResults]),
  ].join('\n'), {
    components: await webButton(tenant, actor.discordId, '/craft/queue', messages.openWeb),
  })
}

export async function handleCraftClaim(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const taskId = stringOption(options, 'task')
  if (!taskId || !DISCORD_COMMAND_UUID_PATTERN.test(taskId)) {
    return ephemeralReply(messages.invalidInput)
  }
  const profile = await loadCraftProfile(actor)
  if (!profile.isCrafter && !actor.isAdmin) return ephemeralReply(messages.crafterOnly)
  try {
    await claimCraftTask({
      taskId,
      guildId: tenant.id,
      crafterDiscordId: actor.discordId,
      crafterUsername: actor.username,
      compensationMode: profile.compensationMode,
      premiumPct: profile.premiumPct,
    })
  } catch {
    return ephemeralReply(messages.invalidInput)
  }
  revalidatePath('/craft/queue')
  return ephemeralReply(messages.craftClaimed)
}

export async function handleCraftRelease(
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const taskId = stringOption(options, 'task')
  if (!taskId || !DISCORD_COMMAND_UUID_PATTERN.test(taskId)) {
    return ephemeralReply(messages.invalidInput)
  }
  try {
    await releaseCraftTask(taskId, actor.guildId, actor.discordId)
  } catch {
    return ephemeralReply(messages.invalidInput)
  }
  revalidatePath('/craft/queue')
  return ephemeralReply(messages.craftReleased)
}

function parseBoundedSetting(raw: string, fallback: number, min: number, max: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

export async function handleCraftDeliver(
  tenant: DiscordCommandTenant,
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const taskId = stringOption(options, 'task')
  const box = integerOption(options, 'box')
  const materialCost = integerOption(options, 'material-cost')
  if (
    !taskId ||
    !DISCORD_COMMAND_UUID_PATTERN.test(taskId) ||
    !box ||
    materialCost == null ||
    materialCost < 0
  ) {
    return ephemeralReply(messages.invalidInput)
  }
  const profile = await loadCraftProfile(actor)
  if (!profile.isCrafter && !actor.isAdmin) return ephemeralReply(messages.crafterOnly)
  const [minRaw, maxRaw, expiryRaw] = await Promise.all([
    getAppSetting('craft_box_range_min', '1', tenant.id),
    getAppSetting('craft_box_range_max', '30', tenant.id),
    getAppSetting('craft_box_expiry_days', '7', tenant.id),
  ])
  const rangeMin = parseBoundedSetting(minRaw, 1, 1, 999)
  const rangeMax = parseBoundedSetting(maxRaw, 30, 1, 999)
  if (box < rangeMin || box > rangeMax) return ephemeralReply(messages.invalidInput)
  try {
    await deliverCraftTask({
      taskId,
      guildId: tenant.id,
      crafterDiscordId: actor.discordId,
      boxNumber: box,
      materialSilverCost: materialCost,
      expiryDays: parseBoundedSetting(expiryRaw, 7, 1, 30),
    })
  } catch {
    return ephemeralReply(messages.invalidInput)
  }

  const db = getAdminClient()
  const { data: task } = await db
    .from('craft_tasks')
    .select('regear_requests!inner(discord_id, event_title_snapshot, build_snapshot, craft_included_slots)')
    .eq('guild_id', tenant.id)
    .eq('id', taskId)
    .maybeSingle()
  const request = Array.isArray(task?.regear_requests)
    ? task.regear_requests[0]
    : task?.regear_requests
  const snapshot = (request?.build_snapshot as BuildSnapshot | null) ?? null
  if (snapshot) {
    try {
      const result = await decrementBuildForDelivery(tenant.id, snapshot, actor.discordId, {
        includedSlots: normalizeCraftRegearSlots(request?.craft_included_slots, false),
      })
      if (!result.empty && result.warnedItemIds.length > 0) {
        await db
          .from('craft_tasks')
          .update({ inventory_warned: true })
          .eq('guild_id', tenant.id)
          .eq('id', taskId)
      }
    } catch (error) {
      log.error('[discord-command-suite] craft inventory decrement failed', error, {
        guild_id: tenant.id,
        task_id: taskId,
      })
    }
  }
  if (request?.discord_id) {
    void sendLocalizedDiscordDmToUser(request.discord_id as string, tenant.id, (tDm) => ({
      title: tDm('craftDeliveredTitle'),
      body: tDm('craftDeliveredBody', {
        event: request.event_title_snapshot ?? '',
        box,
        crafter: actor.username,
      }),
      url: '/me',
    }))
  }
  revalidatePath('/craft/queue')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/craft/inventory')
  return ephemeralReply(formatDiscordCommandMessage(messages.craftDelivered, { box }))
}

export async function handleCraftPickup(
  actor: DiscordCommandActor,
  options: readonly DiscordInteractionOption[],
  messages: DiscordCommandSuiteMessages,
): Promise<DiscordInteractionResponse> {
  const taskId = stringOption(options, 'task')
  if (!taskId || !DISCORD_COMMAND_UUID_PATTERN.test(taskId)) {
    return ephemeralReply(messages.invalidInput)
  }
  try {
    await collectCraftTask(taskId, actor.guildId, actor.discordId)
  } catch {
    return ephemeralReply(messages.invalidInput)
  }
  revalidatePath('/me')
  revalidatePath('/craft/queue')
  return ephemeralReply(messages.craftPickedUp)
}
