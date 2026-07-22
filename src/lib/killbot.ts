import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppSetting } from '@/lib/app-settings'
import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import { type AlbionServer } from '@/lib/albion-gameinfo'
import { fetchJsonWithRetry } from '@/lib/http-retry'
import { resolveAlbionServer } from '@/lib/killboard'
import { buildTenantHostUrl, tenantUrl } from '@/lib/tenant-resolver'
import type { EquipmentItem } from '@/lib/auto-regear-equipment'
import {
  estimateKillbotVictimValue,
  type KillbotVictimValueEstimate,
} from '@/lib/killbot-value'
import {
  buildKillbotBattleDiscordMessage,
  buildKillbotDiscordMessage,
  sendDiscordChannelMessage,
} from '@/lib/killbot-discord'
import {
  computeSides,
  parseRawBattle,
  type AlbionBattlePlayer,
} from '@/lib/albion-battles'
import {
  buildKillbotBattleSummary,
  normalizeKillbotFeedMode,
  type KillbotBattleEventInput,
  type KillbotBattleSummary,
  type KillbotFeedMode,
} from '@/lib/killbot-battle'
import { buildPublicBattleGroupReport } from '@/lib/public-battle-report-model'
import type { PublicBattleRecordRow } from '@/lib/public-battle-report-model'

export {
  buildKillbotBattleDiscordMessage,
  buildKillbotBattleDiscordPayload,
  buildKillbotDiscordMessage,
  buildKillbotDiscordPayload,
} from '@/lib/killbot-discord'
export { buildKillbotBattleSummary, normalizeKillbotFeedMode } from '@/lib/killbot-battle'
export type { KillbotFeedMode } from '@/lib/killbot-battle'

const KILLBOT_EVENTS_PAGE_LIMIT = 51
const KILLBOT_EVENTS_FETCH_LOOKBACK_MS = 20 * 60 * 1000
const KILLBOT_EVENTS_PROCESS_OVERLAP_MS = 8 * 60 * 1000
const KILLBOT_EVENTS_MAX_PAGES = 20
const KILLBOT_BATTLE_SUMMARY_LOOKBACK_MS = 6 * 60 * 60 * 1000
const KILLBOT_BATTLE_TEST_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000
const KILLBOT_BATTLE_SUMMARY_SETTLE_MS = 30 * 60 * 1000
const KILLBOT_BATTLE_GROUP_WINDOW_MS = 60 * 60 * 1000
const KILLBOT_BATTLE_GROUP_GAP_MS = 45 * 60 * 1000
const KILLBOT_BATTLE_PARTICIPANT_OVERLAP_RATIO = 0.35
const KILLBOT_BATTLE_PARTICIPANT_OVERLAP_MIN = 4
const KILLBOT_BATTLE_PARTICIPANT_OVERLAP_MAX = 12
const KILLBOT_BATTLE_GROUP_QUIET_MS = 45 * 60 * 1000
const KILLBOT_BATTLE_SENT_DEDUPE_LOOKBACK_MS = 36 * 60 * 60 * 1000
const DEFAULT_MIN_FAME = 1
const DEFAULT_JUICY_FAME = 1_000_000
const MAX_FAME_SETTING = 2_147_483_647

export type KillbotFeedType = 'kill' | 'death' | 'battle' | 'test'
export type KillbotDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'
export type KillbotTestMessageKind = 'event' | 'battle'
type KillbotDeliverySourceType = 'event' | 'battle' | 'test'

export interface KillbotNotificationSettings {
  individualLogsEnabled: boolean
  battleSummariesEnabled: boolean
}

export interface KillbotFeedChannelSettings {
  channelId: string | null
  individualLogChannelId: string | null
  battleSummaryChannelId: string | null
}

export interface ResolvedKillbotFeedChannels {
  individualLogChannelId: string | null
  battleSummaryChannelId: string | null
  hasAnyChannel: boolean
}

export interface KillbotConfig {
  guildId: string
  enabled: boolean
  channelId: string | null
  individualLogChannelId: string | null
  battleSummaryChannelId: string | null
  minFame: number
  juicyFameThreshold: number
  includeKills: boolean
  includeDeaths: boolean
  feedMode: KillbotFeedMode
  individualLogsEnabled: boolean
  battleSummariesEnabled: boolean
  mentionRoleId: string | null
  lastPolledAt: string | null
  lastSentAt: string | null
  lastError: string | null
  updatedAt: string | null
}

export interface KillbotDelivery {
  eventId: number
  feedType: KillbotFeedType
  sourceType: KillbotDeliverySourceType
  sourceKey: string
  channelId: string
  discordMessageId: string | null
  status: KillbotDeliveryStatus
  error: string | null
  eventOccurredAt: string | null
  fame: number
  createdAt: string
}

export interface KillbotTarget {
  server: AlbionServer | null
  homeGuildId: string
  homeGuildName: string
  tenantSlug: string | null
}

interface PlayerRef {
  Id?: string | null
  Name?: string | null
  GuildId?: string | null
  GuildName?: string | null
  AllianceId?: string | null
  AllianceName?: string | null
  AverageItemPower?: number | string | null
  KillFame?: number | string | null
  DeathFame?: number | string | null
  Equipment?: Record<string, EquipmentItem | null> | null
  Inventory?: Array<EquipmentItem | null> | null
}

export interface AlbionKillbotEvent {
  EventId: number
  TimeStamp: string
  TotalVictimKillFame?: number | null
  BattleId?: number | null
  Killer?: PlayerRef | null
  Victim?: PlayerRef | null
  Participants?: PlayerRef[] | null
}

export interface KillbotMatch {
  feedType: Exclude<KillbotFeedType, 'test' | 'battle'>
  fame: number
  isJuicy: boolean
  killerName: string
  victimName: string
}

export interface KillbotRunResult {
  configs_total: number
  tenants_ready: number
  events_fetched: number
  sent: number
  duplicate_skipped: number
  failed: number
  config_errors: number
  errors: Array<{ guild_id: string; message: string }>
}

export interface KillbotAdminState {
  config: KillbotConfig
  target: KillbotTarget
  deliveries: KillbotDelivery[]
}

interface KillbotConfigRow {
  guild_id: string
  enabled: boolean | null
  channel_id: string | null
  individual_log_channel_id?: string | null
  battle_summary_channel_id?: string | null
  min_fame: number | null
  juicy_fame_threshold: number | null
  include_kills: boolean | null
  include_deaths: boolean | null
  feed_mode?: string | null
  mention_role_id: string | null
  last_polled_at: string | null
  last_sent_at: string | null
  last_error: string | null
  updated_at: string | null
}

interface KillbotDeliveryRow {
  event_id: number
  feed_type: KillbotFeedType
  source_type?: KillbotDeliverySourceType | null
  source_key?: string | null
  channel_id: string
  discord_message_id: string | null
  status: KillbotDeliveryStatus
  error: string | null
  event_occurred_at: string | null
  fame: number | null
  created_at: string
}

export interface SaveKillbotConfigInput {
  enabled: boolean
  channelId?: string | null
  individualLogChannelId?: string | null
  battleSummaryChannelId?: string | null
  minFame: number
  juicyFameThreshold: number
  includeKills: boolean
  includeDeaths: boolean
  feedMode?: KillbotFeedMode
  individualLogsEnabled?: boolean
  battleSummariesEnabled?: boolean
  mentionRoleId?: string | null
}

interface FetchRecentKillbotEventsOptions {
  now?: Date
  lookbackMs?: number
  maxPages?: number
  pageLimit?: number
}

interface KillbotBattleDeliveryCandidate {
  eventId: number
  sourceKey: string
  battleIds: number[]
  eventOccurredAt: string
  fame: number
  summary: KillbotBattleSummary
}

interface LoadKillbotBattleCandidatesOptions {
  lookbackMs?: number
  limit?: number
  ascending?: boolean
  includeUnsettled?: boolean
  lastKillboardSyncAt?: string | null
  lastBattleTrackerSyncAt?: string | null
  settleMs?: number
  quietMs?: number
}

export interface KillbotBattleActivityWindowInput {
  battleId: number
  startedAtMs: number
  endedAtMs: number
  activityAtMs: number
  hasProvisionalRows: boolean
  participantIds?: ReadonlyArray<string>
}

export interface KillbotBattleActivityWindowGroup {
  battleIds: number[]
  startedAtMs: number
  firstActivityAtMs: number
  latestActivityAtMs: number
  latestEndedAtMs: number
  hasProvisionalRows: boolean
  anchorParticipantIds: string[]
}

interface SendKillbotTestMessageOptions {
  channelIdOverride?: string | null
  kind?: KillbotTestMessageKind
  configOverride?: SaveKillbotConfigInput
}

interface KillbotBattleRecordRow {
  id: string
  battle_record_id: string
  home_guild_name: string
  home_team_size: number | null
  home_kills: number | null
  home_deaths: number | null
  home_kill_fame: number | string | null
  main_opponent_force_name: string | null
  main_opponent_team_size: number | null
  primary_opponent_name: string | null
  opponent_team_size: number | null
  started_at: string
  outcome: 'win' | 'loss' | 'tie' | null
  is_provisional: boolean | null
  match_evaluated_at: string | null
  battle_records:
    | {
        albion_server: AlbionServer | null
        albion_battle_id: number | string | null
        started_at: string | null
        cluster_name: string | null
        ended_at: string | null
        total_players: number | null
        total_kills: number | null
        total_fame: number | string | null
        raw_battle: unknown
      }
    | Array<{
        albion_server: AlbionServer | null
        albion_battle_id: number | string | null
        started_at: string | null
        cluster_name: string | null
        ended_at: string | null
        total_players: number | null
        total_kills: number | null
        total_fame: number | string | null
        raw_battle: unknown
      }>
    | null
}

interface KillbotBattleEventRow {
  event_id: number | string | null
  battle_id: number | string | null
  role: string | null
  player_name: string | null
  fame: number | null
  occurred_at: string | null
}

function defaultConfig(guildId: string): KillbotConfig {
  const feedMode: KillbotFeedMode = 'battle'
  return {
    guildId,
    enabled: false,
    channelId: null,
    individualLogChannelId: null,
    battleSummaryChannelId: null,
    minFame: DEFAULT_MIN_FAME,
    juicyFameThreshold: DEFAULT_JUICY_FAME,
    includeKills: true,
    includeDeaths: true,
    feedMode,
    ...killbotFeedModeToNotificationSettings(feedMode),
    mentionRoleId: null,
    lastPolledAt: null,
    lastSentAt: null,
    lastError: null,
  updatedAt: null,
  }
}

function rowToConfig(row: KillbotConfigRow): KillbotConfig {
  const feedMode = normalizeKillbotFeedMode(row.feed_mode)
  return {
    guildId: row.guild_id,
    enabled: row.enabled ?? false,
    channelId: row.channel_id ?? null,
    individualLogChannelId: row.individual_log_channel_id ?? null,
    battleSummaryChannelId: row.battle_summary_channel_id ?? null,
    minFame: clampFameSetting(row.min_fame, DEFAULT_MIN_FAME),
    juicyFameThreshold: clampFameSetting(row.juicy_fame_threshold, DEFAULT_JUICY_FAME),
    includeKills: row.include_kills ?? true,
    includeDeaths: row.include_deaths ?? true,
    feedMode,
    ...killbotFeedModeToNotificationSettings(feedMode),
    mentionRoleId: row.mention_role_id ?? null,
    lastPolledAt: row.last_polled_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    lastError: row.last_error ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

function rowToDelivery(row: KillbotDeliveryRow): KillbotDelivery {
  return {
    eventId: Number(row.event_id),
    feedType: row.feed_type,
    sourceType: row.source_type ?? (row.feed_type === 'test' ? 'test' : 'event'),
    sourceKey: row.source_key ?? String(row.event_id),
    channelId: row.channel_id,
    discordMessageId: row.discord_message_id ?? null,
    status: row.status,
    error: row.error ?? null,
    eventOccurredAt: row.event_occurred_at ?? null,
    fame: Math.max(0, Number(row.fame ?? 0)),
    createdAt: row.created_at,
  }
}

function isEventFeedEnabled(mode: KillbotFeedMode): boolean {
  return mode === 'event' || mode === 'both'
}

function isBattleFeedEnabled(mode: KillbotFeedMode): boolean {
  return mode === 'battle' || mode === 'both'
}

function killbotFeedModeToNotificationSettings(
  feedMode: KillbotFeedMode,
): KillbotNotificationSettings {
  return {
    individualLogsEnabled: isEventFeedEnabled(feedMode),
    battleSummariesEnabled: isBattleFeedEnabled(feedMode),
  }
}

export function killbotNotificationSettingsToFeedMode(
  settings: KillbotNotificationSettings,
): KillbotFeedMode {
  if (settings.individualLogsEnabled && settings.battleSummariesEnabled) return 'both'
  if (settings.individualLogsEnabled) return 'event'
  return 'battle'
}

export function resolveKillbotFeedChannels(
  settings: KillbotFeedChannelSettings,
): ResolvedKillbotFeedChannels {
  const legacyChannelId = settings.channelId?.trim() || null
  const individualLogChannelId =
    settings.individualLogChannelId?.trim() || legacyChannelId
  const battleSummaryChannelId =
    settings.battleSummaryChannelId?.trim() || legacyChannelId
  return {
    individualLogChannelId,
    battleSummaryChannelId,
    hasAnyChannel: !!(individualLogChannelId || battleSummaryChannelId),
  }
}

function clampFameSetting(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(MAX_FAME_SETTING, Math.floor(n)))
}

function normalizeSnowflake(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (!/^\d{5,32}$/.test(trimmed)) {
    throw new Error('invalid_discord_snowflake')
  }
  return trimmed
}

function normalizeSaveInput(input: SaveKillbotConfigInput): SaveKillbotConfigInput {
  const minFame = clampFameSetting(input.minFame, DEFAULT_MIN_FAME)
  const juicyFameThreshold = clampFameSetting(
    input.juicyFameThreshold,
    DEFAULT_JUICY_FAME,
  )
  const hasSplitFeedSettings =
    input.individualLogsEnabled !== undefined ||
    input.battleSummariesEnabled !== undefined
  const feedMode = hasSplitFeedSettings
    ? killbotNotificationSettingsToFeedMode({
        individualLogsEnabled: !!input.individualLogsEnabled,
        battleSummariesEnabled: !!input.battleSummariesEnabled,
      })
    : normalizeKillbotFeedMode(input.feedMode)
  const feedSettings = killbotFeedModeToNotificationSettings(feedMode)
  const individualLogChannelId = normalizeSnowflake(input.individualLogChannelId)
  const battleSummaryChannelId = normalizeSnowflake(input.battleSummaryChannelId)
  const legacyChannelId =
    normalizeSnowflake(input.channelId) ??
    (feedSettings.battleSummariesEnabled ? battleSummaryChannelId : null) ??
    (feedSettings.individualLogsEnabled ? individualLogChannelId : null) ??
    battleSummaryChannelId ??
    individualLogChannelId
  return {
    enabled: !!input.enabled,
    channelId: legacyChannelId,
    individualLogChannelId,
    battleSummaryChannelId,
    minFame,
    juicyFameThreshold,
    includeKills: !!input.includeKills,
    includeDeaths: !!input.includeDeaths,
    feedMode,
    ...feedSettings,
    mentionRoleId: normalizeSnowflake(input.mentionRoleId),
  }
}

export function killbotDashboardUrl(slug: string | null | undefined): string {
  return tenantUrl(slug, '/admin/dashboard/killbot')
}

export async function getKillbotConfig(
  db: SupabaseClient,
  guildId: string,
): Promise<KillbotConfig> {
  const { data, error } = await db
    .from('killbot_configs')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle()
  if (error) throw new Error(`killbot config query failed: ${error.message}`)
  if (!data) return defaultConfig(guildId)
  return rowToConfig(data as KillbotConfigRow)
}

export async function saveKillbotConfig(
  db: SupabaseClient,
  guildId: string,
  input: SaveKillbotConfigInput,
): Promise<KillbotConfig> {
  const normalized = normalizeSaveInput(input)
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('killbot_configs')
    .upsert(
      {
        guild_id: guildId,
        enabled: normalized.enabled,
        channel_id: normalized.channelId,
        individual_log_channel_id: normalized.individualLogChannelId,
        battle_summary_channel_id: normalized.battleSummaryChannelId,
        min_fame: normalized.minFame,
        juicy_fame_threshold: normalized.juicyFameThreshold,
        include_kills: normalized.includeKills,
        include_deaths: normalized.includeDeaths,
        feed_mode: normalized.feedMode,
        mention_role_id: normalized.mentionRoleId,
        last_error: null,
        updated_at: now,
      },
      { onConflict: 'guild_id' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`killbot config save failed: ${error.message}`)
  return rowToConfig(data as KillbotConfigRow)
}

export async function loadKillbotTarget(
  db: SupabaseClient,
  guildId: string,
): Promise<KillbotTarget> {
  const [serverResult, homeGuildId, homeGuildName, tenantResult] = await Promise.all([
    resolveAlbionServer(guildId).catch(() => null),
    getAppSetting('albion_home_guild_id', '', guildId),
    getAppSetting('albion_home_guild_name', '', guildId),
    db
      .from('tenants')
      .select('slug')
      .eq('id', guildId)
      .maybeSingle(),
  ])
  if (tenantResult.error) {
    throw new Error(`killbot tenant query failed: ${tenantResult.error.message}`)
  }
  return {
    server: serverResult,
    homeGuildId: homeGuildId.trim(),
    homeGuildName: homeGuildName.trim(),
    tenantSlug:
      typeof tenantResult.data?.slug === 'string'
        ? tenantResult.data.slug
        : null,
  }
}

export async function loadKillbotAdminState(
  db: SupabaseClient,
  guildId: string,
): Promise<KillbotAdminState> {
  const [config, target, deliveriesResult] = await Promise.all([
    getKillbotConfig(db, guildId),
    loadKillbotTarget(db, guildId),
    db
      .from('killbot_deliveries')
      .select(
        'event_id, feed_type, source_type, source_key, channel_id, discord_message_id, status, error, event_occurred_at, fame, created_at',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (deliveriesResult.error) {
    throw new Error(`killbot deliveries query failed: ${deliveriesResult.error.message}`)
  }

  return {
    config,
    target,
    deliveries: ((deliveriesResult.data ?? []) as KillbotDeliveryRow[]).map(rowToDelivery),
  }
}

export async function fetchRecentKillbotEvents(
  server: AlbionServer,
  options: FetchRecentKillbotEventsOptions = {},
): Promise<AlbionKillbotEvent[]> {
  const base = ALBION_GAMEINFO_ENDPOINTS[server]
  const nowMs = options.now?.getTime() ?? Date.now()
  const lookbackMs = Math.max(0, options.lookbackMs ?? KILLBOT_EVENTS_FETCH_LOOKBACK_MS)
  const cutoffMs = nowMs - lookbackMs
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? KILLBOT_EVENTS_MAX_PAGES))
  const pageLimit = Math.max(
    1,
    Math.min(KILLBOT_EVENTS_PAGE_LIMIT, Math.floor(options.pageLimit ?? KILLBOT_EVENTS_PAGE_LIMIT)),
  )
  const eventsById = new Map<number, AlbionKillbotEvent>()

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageLimit
    const url = `${base}/events?limit=${pageLimit}&offset=${offset}`
    const data = await fetchJsonWithRetry<AlbionKillbotEvent[]>(url, {
      label: 'killbot',
      userAgent: 'albion-zvz-killbot/1.0',
      fetchInit: { cache: 'no-store' },
    })
    if (!Array.isArray(data) || data.length === 0) break

    let reachedCutoff = false
    for (const event of data) {
      const eventMs = new Date(event.TimeStamp).getTime()
      if (Number.isFinite(eventMs) && eventMs < cutoffMs) {
        reachedCutoff = true
        continue
      }
      const eventId = Number(event.EventId)
      if (Number.isFinite(eventId)) {
        eventsById.set(eventId, event)
      }
    }

    if (data.length < pageLimit || reachedCutoff) break
  }

  return Array.from(eventsById.values())
}

function sameGuild(player: PlayerRef | null | undefined, target: KillbotTarget): boolean {
  if (!player) return false
  const playerGuildId = String(player.GuildId ?? '').trim()
  if (target.homeGuildId && playerGuildId && playerGuildId === target.homeGuildId) {
    return true
  }
  const playerGuildName = String(player.GuildName ?? '').trim().toLowerCase()
  return !!target.homeGuildName && playerGuildName === target.homeGuildName.toLowerCase()
}

function playerName(player: PlayerRef | null | undefined): string {
  return String(player?.Name ?? '').trim() || 'Unknown'
}

export function classifyKillbotEvent(
  event: AlbionKillbotEvent,
  target: KillbotTarget,
  config: Pick<KillbotConfig, 'minFame' | 'juicyFameThreshold' | 'includeKills' | 'includeDeaths'>,
): KillbotMatch[] {
  if (!target.homeGuildId && !target.homeGuildName) return []
  const fame = Math.max(0, Math.floor(Number(event.TotalVictimKillFame ?? 0)))
  if (fame < config.minFame) return []

  const killerIsHome = sameGuild(event.Killer, target)
  const victimIsHome = sameGuild(event.Victim, target)
  if (!killerIsHome && !victimIsHome) return []
  if (killerIsHome && victimIsHome) return []

  const base = {
    fame,
    isJuicy: config.juicyFameThreshold > 0 && fame >= config.juicyFameThreshold,
    killerName: playerName(event.Killer),
    victimName: playerName(event.Victim),
  }
  const matches: KillbotMatch[] = []
  if (killerIsHome && config.includeKills) {
    matches.push({ ...base, feedType: 'kill' })
  }
  if (victimIsHome && config.includeDeaths) {
    matches.push({ ...base, feedType: 'death' })
  }
  return matches
}

function eventTimeOrNull(event: AlbionKillbotEvent): string | null {
  const date = new Date(event.TimeStamp)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function killbotProcessWindowStart(lastPolledAt: string | null, polledAt: string): number {
  const polledAtMs = new Date(polledAt).getTime()
  const fallbackNow = Number.isFinite(polledAtMs) ? polledAtMs : Date.now()
  const lookbackStart = fallbackNow - KILLBOT_EVENTS_FETCH_LOOKBACK_MS
  const lastPolledAtMs = new Date(lastPolledAt ?? '').getTime()
  if (!Number.isFinite(lastPolledAtMs)) {
    return Math.max(lookbackStart, fallbackNow - KILLBOT_EVENTS_PROCESS_OVERLAP_MS)
  }
  const anchor = Math.min(lastPolledAtMs, fallbackNow)
  return Math.max(lookbackStart, anchor - KILLBOT_EVENTS_PROCESS_OVERLAP_MS)
}

export function isKillbotEventInsideProcessWindow(
  event: AlbionKillbotEvent,
  lastPolledAt: string | null,
  polledAt: string,
): boolean {
  const eventMs = new Date(event.TimeStamp).getTime()
  if (!Number.isFinite(eventMs)) return true
  return eventMs >= killbotProcessWindowStart(lastPolledAt, polledAt)
}

export function isKillbotBattleSummaryReady(input: {
  endedAt: string | null
  lastKillboardSyncAt: string | null
  lastBattleTrackerSyncAt: string | null
  nowIso: string
  settleMs?: number
  quietMs?: number
}): boolean {
  const endedAtMs = Date.parse(input.endedAt ?? '')
  const nowMs = Date.parse(input.nowIso)
  const killboardSyncMs = Date.parse(input.lastKillboardSyncAt ?? '')
  const battleTrackerSyncMs = Date.parse(input.lastBattleTrackerSyncAt ?? '')
  if (
    !Number.isFinite(endedAtMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(killboardSyncMs) ||
    !Number.isFinite(battleTrackerSyncMs)
  ) {
    return false
  }
  const settleMs = Math.max(
    0,
    Math.floor(input.settleMs ?? KILLBOT_BATTLE_SUMMARY_SETTLE_MS),
  )
  const quietMs = Math.max(0, Math.floor(input.quietMs ?? 0))
  const readyAtMs = endedAtMs + settleMs + quietMs
  return nowMs >= readyAtMs && killboardSyncMs >= readyAtMs && battleTrackerSyncMs >= readyAtMs
}

export function buildKillbotBattleGroupUrl(
  server: AlbionServer,
  battleIds: ReadonlyArray<number>,
  tenantSlug?: string | null,
): string {
  const ids = Array.from(
    new Set(
      battleIds
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ).sort((a, b) => a - b)
  const query = ids.map((id) => String(id)).join(',')
  const path = `/battles/multi?server=${server}&ids=${query}`
  if (tenantSlug) return buildTenantHostUrl(tenantSlug, path)
  return tenantUrl(null, path)
}

function normalizeBattleId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function numberFromDb(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function outcomeLabel(outcome: 'win' | 'loss' | 'tie' | null): string {
  if (outcome === 'win') return 'Win'
  if (outcome === 'loss') return 'Loss'
  if (outcome === 'tie') return 'Tie'
  return ''
}

function killbotTenantUrl(target: KillbotTarget, path: string): string {
  if (target.tenantSlug) return buildTenantHostUrl(target.tenantSlug, path)
  return tenantUrl(null, path)
}

function buildKillbotBattleGroupSourceKey(
  server: AlbionServer,
  battleIds: ReadonlyArray<number>,
): string {
  const ids = Array.from(new Set(battleIds)).sort((a, b) => a - b)
  return `${server}:group:v2:${ids.join(',')}`
}

export function extractKillbotBattleIdsFromSourceKey(sourceKey: string): number[] {
  const marker = ':group:v2:'
  const markerIndex = sourceKey.indexOf(marker)
  if (markerIndex < 0) return []
  return Array.from(
    new Set(
      sourceKey
        .slice(markerIndex + marker.length)
        .split(',')
        .map((part) => normalizeBattleId(part.trim()))
        .filter((id): id is number => id !== null),
    ),
  ).sort((a, b) => a - b)
}

export function hasKillbotBattleSummaryOverlap(
  battleIds: ReadonlyArray<number>,
  sentBattleIds: ReadonlySet<number>,
): boolean {
  return battleIds.some((battleId) => sentBattleIds.has(battleId))
}

function normalizeParticipantIds(ids: ReadonlyArray<string> | undefined): string[] {
  return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))).sort()
}

function participantOverlapCount(
  anchorParticipantIds: ReadonlyArray<string>,
  participantIds: ReadonlyArray<string>,
): number {
  const anchor = new Set(anchorParticipantIds)
  let count = 0
  for (const id of participantIds) {
    if (anchor.has(id)) count += 1
  }
  return count
}

function requiredParticipantOverlap(
  anchorSize: number,
  participantSize: number,
): number | null {
  const smallerSize = Math.min(anchorSize, participantSize)
  if (smallerSize <= 0) return null
  return Math.min(
    KILLBOT_BATTLE_PARTICIPANT_OVERLAP_MAX,
    Math.max(
      KILLBOT_BATTLE_PARTICIPANT_OVERLAP_MIN,
      Math.ceil(smallerSize * KILLBOT_BATTLE_PARTICIPANT_OVERLAP_RATIO),
    ),
  )
}

function hasEnoughAnchorParticipantOverlap(
  anchorParticipantIds: ReadonlyArray<string>,
  participantIds: ReadonlyArray<string>,
): boolean | null {
  const required = requiredParticipantOverlap(
    anchorParticipantIds.length,
    participantIds.length,
  )
  if (required === null) return null
  return participantOverlapCount(anchorParticipantIds, participantIds) >= required
}

export function groupKillbotBattleActivityWindows(
  battles: ReadonlyArray<KillbotBattleActivityWindowInput>,
  options: {
    windowMs?: number
    gapMs?: number
  } = {},
): KillbotBattleActivityWindowGroup[] {
  const windowMs = Math.max(
    0,
    Math.floor(options.windowMs ?? KILLBOT_BATTLE_GROUP_WINDOW_MS),
  )
  const gapMs = Math.max(
    0,
    Math.floor(options.gapMs ?? KILLBOT_BATTLE_GROUP_GAP_MS),
  )
  const sortedBattles = battles
    .filter(
      (battle) =>
        Number.isFinite(battle.battleId) &&
        Number.isFinite(battle.startedAtMs) &&
        Number.isFinite(battle.endedAtMs) &&
        Number.isFinite(battle.activityAtMs),
    )
    .sort(
      (a, b) =>
        a.activityAtMs - b.activityAtMs ||
        a.startedAtMs - b.startedAtMs ||
        a.battleId - b.battleId,
    )

  const groups: KillbotBattleActivityWindowGroup[] = []
  for (const battle of sortedBattles) {
    const previous = groups.at(-1)
    const participantIds = normalizeParticipantIds(battle.participantIds)
    const participantOverlap = previous
      ? hasEnoughAnchorParticipantOverlap(previous.anchorParticipantIds, participantIds)
      : null
    const isOutsideWindow = previous
      ? battle.activityAtMs - previous.firstActivityAtMs > windowMs
      : false
    const isOutsideGap = previous
      ? battle.activityAtMs - previous.latestActivityAtMs > gapMs
      : false
    const shouldStartNewGroup =
      !previous ||
      isOutsideGap ||
      participantOverlap === false ||
      (participantOverlap === null && isOutsideWindow)
    if (shouldStartNewGroup) {
      groups.push({
        battleIds: [battle.battleId],
        startedAtMs: battle.startedAtMs,
        firstActivityAtMs: battle.activityAtMs,
        latestActivityAtMs: battle.activityAtMs,
        latestEndedAtMs: battle.endedAtMs,
        hasProvisionalRows: battle.hasProvisionalRows,
        anchorParticipantIds: participantIds,
      })
      continue
    }

    groups[groups.length - 1] = {
      ...previous,
      battleIds: [...previous.battleIds, battle.battleId],
      startedAtMs: Math.min(previous.startedAtMs, battle.startedAtMs),
      latestActivityAtMs: Math.max(previous.latestActivityAtMs, battle.activityAtMs),
      latestEndedAtMs: Math.max(previous.latestEndedAtMs, battle.endedAtMs),
      hasProvisionalRows: previous.hasProvisionalRows || battle.hasProvisionalRows,
    }
  }

  return groups
}

function killboardKillUrl(eventId: string): string {
  return `https://albiononline.com/killboard/kill/${encodeURIComponent(eventId)}`
}

function summarizeOpponentNames(names: ReadonlyArray<string>): string {
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)))
  if (uniqueNames.length === 0) return 'Multiple opponents'
  if (uniqueNames.length <= 2) return uniqueNames.join(', ')
  return `${uniqueNames.slice(0, 2).join(', ')} +${uniqueNames.length - 2}`
}

function battleRecord(row: KillbotBattleRecordRow): Exclude<KillbotBattleRecordRow['battle_records'], null | unknown[]> | null {
  return Array.isArray(row.battle_records) ? row.battle_records[0] ?? null : row.battle_records
}

function battlePlayerStableId(player: AlbionBattlePlayer): string | null {
  const playerId = player.id?.trim()
  if (playerId) return playerId
  const guildId = player.guildId?.trim()
  const name = player.name?.trim()
  if (guildId && name) return `${guildId}:${name}`
  return null
}

function collectHomeParticipantIds(rawBattle: unknown, homeGuildId: string): string[] {
  const battle = parseRawBattle(rawBattle)
  if (!battle) return []
  const sides = computeSides(battle, homeGuildId)
  if (!sides) return []
  const homeGuildIds = new Set(sides.home.guildIds)
  const participantIds = Object.values(battle.players ?? {})
    .filter((player) => homeGuildIds.has(player.guildId))
    .map(battlePlayerStableId)
    .filter((id): id is string => id !== null)
  return normalizeParticipantIds(participantIds)
}

async function loadKillbotBattleCandidates(
  db: SupabaseClient,
  config: KillbotConfig,
  target: KillbotTarget,
  polledAt: string,
  options: LoadKillbotBattleCandidatesOptions = {},
): Promise<KillbotBattleDeliveryCandidate[]> {
  if (!target.server) return []
  const server = target.server
  const polledAtMs = new Date(polledAt).getTime()
  const lookbackMs = options.lookbackMs ?? KILLBOT_BATTLE_SUMMARY_LOOKBACK_MS
  const since = new Date(
    (Number.isFinite(polledAtMs) ? polledAtMs : Date.now()) -
      lookbackMs,
  ).toISOString()

  let battleQuery = db
    .from('tenant_zvz_battle_records')
    .select(
      'id, battle_record_id, home_guild_name, home_team_size, home_kills, home_deaths, home_kill_fame, main_opponent_force_name, main_opponent_team_size, primary_opponent_name, opponent_team_size, started_at, outcome, is_provisional, match_evaluated_at, battle_records!inner(albion_server, albion_battle_id, started_at, cluster_name, ended_at, total_players, total_kills, total_fame, raw_battle)',
    )
    .eq('guild_id', config.guildId)
    .gte('started_at', since)
    .eq('battle_records.albion_server', server)
    .order('started_at', { ascending: options.ascending ?? true })
  if (options.limit && options.limit > 0) {
    battleQuery = battleQuery.limit(Math.floor(options.limit))
  }
  const { data: battleRows, error: battleErr } = await battleQuery
  if (battleErr) throw new Error(`killbot battle rows query failed: ${battleErr.message}`)

  type BattleAggregate = {
    canonical: KillbotBattleRecordRow
    albionBattleId: number
    startedAt: string
    endedAt: string
    startedAtMs: number
    endedAtMs: number
    homeTeamSize: number
    homeKills: number
    homeDeaths: number
    homeKillFame: number
    opponentTeamSize: number
    opponentNames: string[]
    clusterNames: string[]
    hasProvisionalRows: boolean
  }
  const battles = new Map<number, BattleAggregate>()
  for (const row of (battleRows ?? []) as KillbotBattleRecordRow[]) {
    const br = battleRecord(row)
    const albionBattleId = normalizeBattleId(br?.albion_battle_id)
    if (!br || albionBattleId === null) continue
    if (!br.ended_at) continue
    const startedAtMs = Date.parse(row.started_at)
    const endedAtMs = Date.parse(br.ended_at)
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) continue
    const existing = battles.get(albionBattleId)
    const homeTeamSize = numberFromDb(row.home_team_size)
    const homeKills = numberFromDb(row.home_kills)
    const homeDeaths = numberFromDb(row.home_deaths)
    const homeKillFame = numberFromDb(row.home_kill_fame)
    const existingMainSize = numberFromDb(existing?.canonical.main_opponent_team_size)
    const rowMainSize = numberFromDb(row.main_opponent_team_size)
    const opponentName =
      row.main_opponent_force_name ?? row.primary_opponent_name ?? null
    const clusterName = br.cluster_name?.trim() || null
    battles.set(albionBattleId, {
      canonical: !existing || rowMainSize > existingMainSize ? row : existing.canonical,
      albionBattleId,
      startedAt: existing?.startedAt ?? row.started_at,
      endedAt: br.ended_at,
      startedAtMs: Math.min(existing?.startedAtMs ?? startedAtMs, startedAtMs),
      endedAtMs: Math.max(existing?.endedAtMs ?? endedAtMs, endedAtMs),
      homeTeamSize: Math.max(existing?.homeTeamSize ?? 0, homeTeamSize),
      homeKills: (existing?.homeKills ?? 0) + homeKills,
      homeDeaths: (existing?.homeDeaths ?? 0) + homeDeaths,
      homeKillFame: (existing?.homeKillFame ?? 0) + homeKillFame,
      opponentTeamSize:
        (existing?.opponentTeamSize ?? 0) +
        (numberFromDb(row.main_opponent_team_size) || numberFromDb(row.opponent_team_size)),
      opponentNames: opponentName
        ? [...(existing?.opponentNames ?? []), opponentName]
        : existing?.opponentNames ?? [],
      clusterNames: clusterName
        ? [...(existing?.clusterNames ?? []), clusterName]
        : existing?.clusterNames ?? [],
      hasProvisionalRows: (existing?.hasProvisionalRows ?? false) || row.is_provisional === true,
    })
  }

  if (battles.size === 0) return []

  const allBattleIds = Array.from(battles.keys())
  const { data: eventRows, error: eventErr } = await db
    .from('killboard_events')
    .select('event_id, battle_id, role, player_name, fame, occurred_at')
    .eq('guild_id', config.guildId)
    .in('battle_id', allBattleIds)
    .order('occurred_at', { ascending: true })
  if (eventErr) throw new Error(`killbot battle events query failed: ${eventErr.message}`)

  const eventsByBattleId = new Map<number, KillbotBattleEventInput[]>()
  const activityAtMsByBattleId = new Map<number, number>()
  for (const row of (eventRows ?? []) as KillbotBattleEventRow[]) {
    if (row.role !== 'killer' && row.role !== 'victim') continue
    const battleId = normalizeBattleId(row.battle_id)
    const eventId = String(row.event_id ?? '').trim()
    const playerName = String(row.player_name ?? '').trim()
    if (battleId === null || !eventId || !playerName) continue
    const occurredAtMs = Date.parse(row.occurred_at ?? '')
    if (Number.isFinite(occurredAtMs)) {
      const currentActivityAtMs = activityAtMsByBattleId.get(battleId)
      if (currentActivityAtMs === undefined || occurredAtMs < currentActivityAtMs) {
        activityAtMsByBattleId.set(battleId, occurredAtMs)
      }
    }
    const events = eventsByBattleId.get(battleId) ?? []
    eventsByBattleId.set(battleId, [
      ...events,
      {
        eventId,
        role: row.role,
        playerName,
        fame: numberFromDb(row.fame),
        occurredAt: row.occurred_at,
      },
    ])
  }

  type BattleSessionGroup = {
    battles: BattleAggregate[]
    startedAtMs: number
    firstActivityAtMs: number
    latestEndedAtMs: number
    hasProvisionalRows: boolean
  }
  const sessionGroups = groupKillbotBattleActivityWindows(
    Array.from(battles.values()).map((battle) => ({
      battleId: battle.albionBattleId,
      startedAtMs: battle.startedAtMs,
      endedAtMs: battle.endedAtMs,
      activityAtMs: activityAtMsByBattleId.get(battle.albionBattleId) ?? battle.startedAtMs,
      hasProvisionalRows: battle.hasProvisionalRows,
      participantIds: collectHomeParticipantIds(
        battleRecord(battle.canonical)?.raw_battle,
        target.homeGuildId,
      ),
    })),
  )
    .map<BattleSessionGroup | null>((group) => {
      const groupBattles = group.battleIds
        .map((battleId) => battles.get(battleId) ?? null)
        .filter((battle): battle is BattleAggregate => battle !== null)
      if (groupBattles.length === 0) return null
      return {
        battles: groupBattles,
        startedAtMs: group.startedAtMs,
        firstActivityAtMs: group.firstActivityAtMs,
        latestEndedAtMs: group.latestEndedAtMs,
        hasProvisionalRows: group.hasProvisionalRows,
      }
    })
    .filter((group): group is BattleSessionGroup => group !== null)

  const readyGroups = sessionGroups.filter((group) => {
    if (options.includeUnsettled) return true
    if (group.hasProvisionalRows) return false
    return isKillbotBattleSummaryReady({
      endedAt: new Date(group.latestEndedAtMs).toISOString(),
      lastKillboardSyncAt: options.lastKillboardSyncAt ?? null,
      lastBattleTrackerSyncAt: options.lastBattleTrackerSyncAt ?? null,
      nowIso: polledAt,
      settleMs: options.settleMs,
      quietMs: options.quietMs ?? KILLBOT_BATTLE_GROUP_QUIET_MS,
    })
  })
  if (readyGroups.length === 0) return []

  return readyGroups
    .map<KillbotBattleDeliveryCandidate | null>((group) => {
      const sortedGroupBattles = [...group.battles].sort(
        (a, b) => a.startedAtMs - b.startedAtMs || a.albionBattleId - b.albionBattleId,
      )
      const canonical = sortedGroupBattles.reduce((best, battle) => {
        const bestSize = numberFromDb(best.canonical.main_opponent_team_size)
        const battleSize = numberFromDb(battle.canonical.main_opponent_team_size)
        return battleSize > bestSize ? battle : best
      }, sortedGroupBattles[0])
      if (!canonical) return null
      const br = battleRecord(canonical.canonical)
      if (!br) return null
      const groupBattleIds = sortedGroupBattles.map((battle) => battle.albionBattleId)
      const battleEvents = sortedGroupBattles.flatMap(
        (battle) => eventsByBattleId.get(battle.albionBattleId) ?? [],
      )
      if (battleEvents.length === 0) return null
      const detailUrl = buildKillbotBattleGroupUrl(server, groupBattleIds, target.tenantSlug)
      const clusterNames = Array.from(
        new Set(sortedGroupBattles.flatMap((battle) => battle.clusterNames)),
      )
      const publicBattleRows = sortedGroupBattles
        .map<PublicBattleRecordRow | null>((battle) => {
          const raw = battleRecord(battle.canonical)
          if (!raw) return null
          return {
            id: battle.canonical.battle_record_id,
            albion_battle_id: raw.albion_battle_id,
            started_at: raw.started_at ?? battle.startedAt,
            ended_at: raw.ended_at ?? battle.endedAt,
            total_players: raw.total_players,
            total_kills: raw.total_kills,
            total_fame: raw.total_fame,
            cluster_name: raw.cluster_name,
            raw_battle: raw.raw_battle,
          }
        })
        .filter((row): row is PublicBattleRecordRow => row !== null)
      const rawReport = buildPublicBattleGroupReport({
        server,
        requestedBattleIds: groupBattleIds,
        battleRows: publicBattleRows,
        eventRows: [],
        highlightGuildId: target.homeGuildId,
        highlightGuildName: target.homeGuildName,
      })
      const primaryForce = rawReport?.primaryForce ?? null
      const homeKills = primaryForce
        ? primaryForce.kills
        : sortedGroupBattles.reduce((sum, battle) => sum + battle.homeKills, 0)
      const homeDeaths = primaryForce
        ? primaryForce.deaths
        : sortedGroupBattles.reduce((sum, battle) => sum + battle.homeDeaths, 0)
      const homeKillFame = primaryForce
        ? primaryForce.killFame
        : sortedGroupBattles.reduce((sum, battle) => sum + battle.homeKillFame, 0)
      const homeTeamSize = primaryForce
        ? primaryForce.players
        : Math.max(...sortedGroupBattles.map((battle) => battle.homeTeamSize))
      const opponentTeamSize = rawReport && primaryForce
        ? Math.max(0, rawReport.totalPlayersUnique - primaryForce.players)
        : sortedGroupBattles.reduce((sum, battle) => sum + battle.opponentTeamSize, 0)
      const opponentName = rawReport && primaryForce
        ? summarizeOpponentNames(
            rawReport.forces
              .filter((force) => force.forceKey !== primaryForce.forceKey)
              .map((force) => force.forceName),
          )
        : summarizeOpponentNames(
            sortedGroupBattles.flatMap((battle) => battle.opponentNames),
          )
      const summaryClusterNames = rawReport?.clusterNames.length
        ? rawReport.clusterNames
        : clusterNames
      const forceLines = rawReport?.forces.slice(0, 4).map((force) => ({
        forceName: force.forceName,
        guildNames: force.guildNames,
        players: force.players,
        kills: force.kills,
        deaths: force.deaths,
        killFame: force.killFame,
      }))
      const summary = buildKillbotBattleSummary({
        battleDetailUrl: detailUrl,
        battleEventUrl: killboardKillUrl,
        albionBattleId: canonical.albionBattleId,
        albionBattleIds: groupBattleIds,
        clusterName: summaryClusterNames.length === 1 ? summaryClusterNames[0] : null,
        startedAt: rawReport?.startedAt ?? new Date(group.startedAtMs).toISOString(),
        homeGuildName: primaryForce?.forceName ?? canonical.canonical.home_guild_name,
        opponentName,
        homeTeamSize,
        opponentTeamSize,
        homeKills,
        homeDeaths,
        homeKillFame,
        resultLabel:
          sortedGroupBattles.length > 1
            ? `${sortedGroupBattles.length} battles`
            : outcomeLabel(canonical.canonical.outcome),
        minFame: config.minFame,
        juicyFameThreshold: config.juicyFameThreshold,
        events: battleEvents,
        forceLines,
      })
      if (summary.topKills.length === 0 && summary.topDeaths.length === 0) return null
      return {
        eventId: canonical.albionBattleId,
        sourceKey: buildKillbotBattleGroupSourceKey(server, groupBattleIds),
        battleIds: groupBattleIds,
        eventOccurredAt: new Date(group.firstActivityAtMs).toISOString(),
        fame: Math.min(MAX_FAME_SETTING, homeKillFame),
        summary,
      }
    })
    .filter((candidate): candidate is KillbotBattleDeliveryCandidate => candidate !== null)
}

async function reserveDeliverySource(
  db: SupabaseClient,
  guildId: string,
  input: {
    eventId: number
    feedType: KillbotFeedType
    sourceType: KillbotDeliverySourceType
    sourceKey: string
    channelId: string
    status?: KillbotDeliveryStatus
    eventOccurredAt: string | null
    fame: number
    payload: Record<string, unknown>
  },
): Promise<boolean> {
  const { data, error } = await db
    .from('killbot_deliveries')
    .upsert(
      {
        guild_id: guildId,
        event_id: input.eventId,
        feed_type: input.feedType,
        source_type: input.sourceType,
        source_key: input.sourceKey,
        channel_id: input.channelId,
        status: input.status ?? 'pending',
        error: null,
        event_occurred_at: input.eventOccurredAt,
        fame: input.fame,
        payload: input.payload,
      },
      {
        onConflict: 'guild_id,source_type,source_key,feed_type',
        ignoreDuplicates: true,
      },
    )
    .select('source_key')
  if (error) throw new Error(`killbot delivery reserve failed: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

async function loadRecentlySentBattleSummaryBattleIds(
  db: SupabaseClient,
  guildId: string,
  nowIso: string,
): Promise<Set<number>> {
  const nowMs = Date.parse(nowIso)
  const since = new Date(
    (Number.isFinite(nowMs) ? nowMs : Date.now()) -
      KILLBOT_BATTLE_SENT_DEDUPE_LOOKBACK_MS,
  ).toISOString()
  const { data, error } = await db
    .from('killbot_deliveries')
    .select('source_key')
    .eq('guild_id', guildId)
    .eq('source_type', 'battle')
    .eq('feed_type', 'battle')
    .eq('status', 'sent')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    throw new Error(`killbot sent battle summary query failed: ${error.message}`)
  }

  const sentBattleIds = new Set<number>()
  for (const row of (data ?? []) as Array<{ source_key: string | null }>) {
    for (const battleId of extractKillbotBattleIdsFromSourceKey(row.source_key ?? '')) {
      sentBattleIds.add(battleId)
    }
  }
  return sentBattleIds
}

async function reserveDelivery(
  db: SupabaseClient,
  guildId: string,
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  channelId: string,
): Promise<boolean> {
  return reserveDeliverySource(db, guildId, {
    eventId: Number(event.EventId),
    feedType: match.feedType,
    sourceType: 'event',
    sourceKey: String(event.EventId),
    channelId,
    eventOccurredAt: eventTimeOrNull(event),
    fame: match.fame,
    payload: event as unknown as Record<string, unknown>,
  })
}

async function markDeliverySource(
  db: SupabaseClient,
  guildId: string,
  sourceType: KillbotDeliverySourceType,
  sourceKey: string,
  feedType: KillbotFeedType,
  update: {
    status: KillbotDeliveryStatus
    discordMessageId?: string | null
    error?: string | null
  },
): Promise<void> {
  const { error } = await db
    .from('killbot_deliveries')
    .update({
      status: update.status,
      discord_message_id: update.discordMessageId ?? null,
      error: update.error ?? null,
    })
    .eq('guild_id', guildId)
    .eq('source_type', sourceType)
    .eq('source_key', sourceKey)
    .eq('feed_type', feedType)
  if (error) throw new Error(`killbot delivery update failed: ${error.message}`)
}

async function markDelivery(
  db: SupabaseClient,
  guildId: string,
  eventId: number,
  feedType: KillbotFeedType,
  update: {
    status: KillbotDeliveryStatus
    discordMessageId?: string | null
    error?: string | null
  },
): Promise<void> {
  return markDeliverySource(db, guildId, 'event', String(eventId), feedType, update)
}

async function updateConfigRuntimeStatus(
  db: SupabaseClient,
  guildId: string,
  update: { lastPolledAt?: string; lastSentAt?: string; lastError?: string | null },
): Promise<void> {
  const row: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (update.lastPolledAt !== undefined) row.last_polled_at = update.lastPolledAt
  if (update.lastSentAt !== undefined) row.last_sent_at = update.lastSentAt
  if (update.lastError !== undefined) row.last_error = update.lastError
  const { error } = await db.from('killbot_configs').update(row).eq('guild_id', guildId)
  if (error) throw new Error(`killbot config status update failed: ${error.message}`)
}

export async function runKillbotFeed(db: SupabaseClient): Promise<KillbotRunResult> {
  const result: KillbotRunResult = {
    configs_total: 0,
    tenants_ready: 0,
    events_fetched: 0,
    sent: 0,
    duplicate_skipped: 0,
    failed: 0,
    config_errors: 0,
    errors: [],
  }

  const { data, error } = await db
    .from('killbot_configs')
    .select('*')
    .eq('enabled', true)

  if (error) throw new Error(`killbot config list failed: ${error.message}`)
  const configs = ((data ?? []) as KillbotConfigRow[])
    .map(rowToConfig)
    .filter((config) => resolveKillbotFeedChannels(config).hasAnyChannel)
  result.configs_total = configs.length

  const targets = await Promise.all(
    configs.map(async (config) => ({
      config,
      target: await loadKillbotTarget(db, config.guildId),
    })),
  )

  const eventsByServer = new Map<AlbionServer, AlbionKillbotEvent[]>()
  for (const { config, target } of targets) {
    if (!target.server || (!target.homeGuildId && !target.homeGuildName)) {
      result.config_errors += 1
      const message = !target.server
        ? 'albion_server not configured'
        : 'albion_home_guild_id/name not configured'
      result.errors.push({ guild_id: config.guildId, message })
      await updateConfigRuntimeStatus(db, config.guildId, {
        lastPolledAt: new Date().toISOString(),
        lastError: message,
      })
      continue
    }
    const channels = resolveKillbotFeedChannels(config)
    if (
      isEventFeedEnabled(config.feedMode) &&
      channels.individualLogChannelId &&
      !eventsByServer.has(target.server)
    ) {
      const events = await fetchRecentKillbotEvents(target.server)
      eventsByServer.set(target.server, events.slice().reverse())
      result.events_fetched += events.length
    }
  }

  for (const { config, target } of targets) {
    const channels = resolveKillbotFeedChannels(config)
    const individualLogChannelId = channels.individualLogChannelId
    const battleSummaryChannelId = channels.battleSummaryChannelId
    const hasActiveFeedChannel =
      (isEventFeedEnabled(config.feedMode) && !!individualLogChannelId) ||
      (isBattleFeedEnabled(config.feedMode) && !!battleSummaryChannelId)
    if (!hasActiveFeedChannel || !target.server || (!target.homeGuildId && !target.homeGuildName)) {
      continue
    }
    result.tenants_ready += 1
    const polledAt = new Date().toISOString()
    const events = (eventsByServer.get(target.server) ?? []).filter((event) =>
      isKillbotEventInsideProcessWindow(event, config.lastPolledAt, polledAt),
    )
    let lastSentAt: string | null = null
    let lastError: string | null = null

    if (isBattleFeedEnabled(config.feedMode) && battleSummaryChannelId) {
      let candidates: KillbotBattleDeliveryCandidate[] = []
      let sentBattleSummaryBattleIds = new Set<number>()
      try {
        const [lastKillboardSyncAt, lastBattleTrackerSyncAt] = await Promise.all([
          getAppSetting('last_killboard_sync_at', '', config.guildId),
          getAppSetting('last_battle_tracker_sync_at', '', config.guildId),
        ])
        candidates = await loadKillbotBattleCandidates(db, config, target, polledAt, {
          lastKillboardSyncAt,
          lastBattleTrackerSyncAt,
        })
        if (candidates.length > 0) {
          sentBattleSummaryBattleIds = await loadRecentlySentBattleSummaryBattleIds(
            db,
            config.guildId,
            polledAt,
          )
        }
      } catch (err) {
        candidates = []
        result.failed += 1
        lastError = err instanceof Error ? err.message : String(err)
        result.errors.push({ guild_id: config.guildId, message: lastError })
      }

      for (const candidate of candidates) {
        if (
          hasKillbotBattleSummaryOverlap(
            candidate.battleIds,
            sentBattleSummaryBattleIds,
          )
        ) {
          result.duplicate_skipped += 1
          continue
        }
        let reserved = false
        try {
          reserved = await reserveDeliverySource(db, config.guildId, {
            eventId: candidate.eventId,
            feedType: 'battle',
            sourceType: 'battle',
            sourceKey: candidate.sourceKey,
            channelId: battleSummaryChannelId,
            eventOccurredAt: candidate.eventOccurredAt,
            fame: candidate.fame,
            payload: candidate.summary as unknown as Record<string, unknown>,
          })
        } catch (err) {
          result.failed += 1
          lastError = err instanceof Error ? err.message : String(err)
          result.errors.push({ guild_id: config.guildId, message: lastError })
          continue
        }
        if (!reserved) {
          result.duplicate_skipped += 1
          continue
        }
        try {
          const discordMessageId = await sendDiscordChannelMessage(
            battleSummaryChannelId,
            await buildKillbotBattleDiscordMessage(candidate.summary, config, target),
          )
          await markDeliverySource(db, config.guildId, 'battle', candidate.sourceKey, 'battle', {
            status: 'sent',
            discordMessageId,
            error: null,
          })
          lastSentAt = new Date().toISOString()
          result.sent += 1
          for (const battleId of candidate.battleIds) {
            sentBattleSummaryBattleIds.add(battleId)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await markDeliverySource(db, config.guildId, 'battle', candidate.sourceKey, 'battle', {
            status: 'failed',
            error: message,
          }).catch(() => undefined)
          lastError = message
          result.failed += 1
          result.errors.push({ guild_id: config.guildId, message })
        }
      }
    }

    if (isEventFeedEnabled(config.feedMode) && individualLogChannelId) {
      for (const event of events) {
        for (const match of classifyKillbotEvent(event, target, config)) {
          let reserved = false
          try {
            reserved = await reserveDelivery(db, config.guildId, event, match, individualLogChannelId)
          } catch (err) {
            result.failed += 1
            lastError = err instanceof Error ? err.message : String(err)
            result.errors.push({ guild_id: config.guildId, message: lastError })
            continue
          }
          if (!reserved) {
            result.duplicate_skipped += 1
            continue
          }
          try {
            const valueEstimate = await estimateKillbotVictimValue(
              event,
              config.guildId,
            ).catch(() => null)
            const discordMessageId = await sendDiscordChannelMessage(
              individualLogChannelId,
              await buildKillbotDiscordMessage(
                event,
                match,
                config,
                target,
                valueEstimate,
              ),
            )
            await markDelivery(db, config.guildId, Number(event.EventId), match.feedType, {
              status: 'sent',
              discordMessageId,
              error: null,
            })
            lastSentAt = new Date().toISOString()
            result.sent += 1
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await markDelivery(db, config.guildId, Number(event.EventId), match.feedType, {
              status: 'failed',
              error: message,
            }).catch(() => undefined)
            lastError = message
            result.failed += 1
            result.errors.push({ guild_id: config.guildId, message })
          }
        }
      }
    }

    await updateConfigRuntimeStatus(db, config.guildId, {
      lastPolledAt: polledAt,
      lastSentAt: lastSentAt ?? undefined,
      lastError,
    })
  }

  return result
}

function normalizeKillbotTestMessageKind(value: unknown): KillbotTestMessageKind {
  return value === 'battle' ? 'battle' : 'event'
}

function normalizeKillbotTestMessageOptions(
  options?: SendKillbotTestMessageOptions | string | null,
): {
  channelIdOverride: string | null
  kind: KillbotTestMessageKind | null
  configOverride: SaveKillbotConfigInput | null
} {
  if (typeof options === 'string' || options === null) {
    return {
      channelIdOverride: options ?? null,
      kind: null,
      configOverride: null,
    }
  }
  return {
    channelIdOverride: options?.channelIdOverride ?? null,
    kind: options?.kind ? normalizeKillbotTestMessageKind(options.kind) : null,
    configOverride: options?.configOverride ?? null,
  }
}

function applyKillbotTestConfigOverride(
  storedConfig: KillbotConfig,
  configOverride: SaveKillbotConfigInput | null,
): KillbotConfig {
  if (!configOverride) return storedConfig
  const normalized = normalizeSaveInput(configOverride)
  const feedMode = normalizeKillbotFeedMode(normalized.feedMode)
  const feedSettings = killbotFeedModeToNotificationSettings(feedMode)
  return {
    ...storedConfig,
    enabled: normalized.enabled,
    channelId: normalized.channelId ?? null,
    individualLogChannelId: normalized.individualLogChannelId ?? null,
    battleSummaryChannelId: normalized.battleSummaryChannelId ?? null,
    minFame: normalized.minFame,
    juicyFameThreshold: normalized.juicyFameThreshold,
    includeKills: normalized.includeKills,
    includeDeaths: normalized.includeDeaths,
    feedMode,
    ...feedSettings,
    mentionRoleId: normalized.mentionRoleId ?? storedConfig.mentionRoleId,
  }
}

function resolveKillbotTestChannelId(
  config: KillbotConfig,
  kind: KillbotTestMessageKind,
  channelIdOverride: string | null,
): string | null {
  const channels = resolveKillbotFeedChannels(config)
  if (kind === 'battle') {
    return normalizeSnowflake(channelIdOverride) ?? channels.battleSummaryChannelId
  }
  return normalizeSnowflake(channelIdOverride) ?? channels.individualLogChannelId
}

export function buildKillbotBattleTestSummary(
  config: KillbotConfig,
  target: KillbotTarget,
): KillbotBattleSummary {
  const testBattleIds = [123456789, 123456790]
  const detailUrl = target.server
    ? buildKillbotBattleGroupUrl(target.server, testBattleIds, target.tenantSlug)
    : killbotTenantUrl(target, '/battles')
  const homeGuildName = target.homeGuildName || 'Configured guild'
  const startedAt = new Date().toISOString()
  const summary = buildKillbotBattleSummary({
    battleDetailUrl: detailUrl,
    battleEventUrl: () => detailUrl,
    albionBattleId: testBattleIds[0],
    albionBattleIds: testBattleIds,
    clusterName: 'Test Cluster',
    startedAt,
    homeGuildName,
    opponentName: 'Enemy Alliance',
    homeTeamSize: 36,
    opponentTeamSize: 32,
    homeKills: 84,
    homeDeaths: 22,
    homeKillFame: 62_500_000,
    resultLabel: '2 battles',
    minFame: 0,
    juicyFameThreshold: config.juicyFameThreshold || DEFAULT_JUICY_FAME,
    forceLines: [
      {
        forceName: 'GRU',
        guildNames: [homeGuildName, 'MINlONS'],
        players: 36,
        kills: 84,
        deaths: 22,
        killFame: 62_500_000,
      },
      {
        forceName: 'Enemy Alliance',
        guildNames: ['Enemy Guild'],
        players: 46,
        kills: 32,
        deaths: 32,
        killFame: 16_500_000,
      },
      {
        forceName: 'Third Party',
        guildNames: ['Third Guild'],
        players: 35,
        kills: 8,
        deaths: 44,
        killFame: 3_100_000,
      },
    ],
    events: [
      {
        eventId: 900001,
        role: 'killer',
        playerName: 'Test Caller',
        fame: 1_900_000,
        occurredAt: startedAt,
      },
      {
        eventId: 900002,
        role: 'killer',
        playerName: 'Test Caller',
        fame: 850_000,
        occurredAt: startedAt,
      },
      {
        eventId: 900003,
        role: 'victim',
        playerName: 'Test Caller',
        fame: 720_000,
        occurredAt: startedAt,
      },
      {
        eventId: 900004,
        role: 'victim',
        playerName: 'Downed Healer',
        fame: 2_100_000,
        occurredAt: startedAt,
      },
      {
        eventId: 900005,
        role: 'killer',
        playerName: 'Burst Bomber',
        fame: config.juicyFameThreshold || DEFAULT_JUICY_FAME,
        occurredAt: startedAt,
      },
    ],
  })
  return {
    ...summary,
    title: 'AlbionGuildManager battle summary test',
  }
}

async function insertKillbotTestDelivery(
  db: SupabaseClient,
  input: {
    guildId: string
    channelId: string
    discordMessageId: string
    kind: KillbotTestMessageKind
    payload: Record<string, unknown>
  },
): Promise<void> {
  const eventId = Date.now()
  await db.from('killbot_deliveries').insert({
    guild_id: input.guildId,
    event_id: eventId,
    feed_type: 'test',
    source_type: 'test',
    source_key: `${input.kind}-test:${eventId}`,
    channel_id: input.channelId,
    discord_message_id: input.discordMessageId,
    status: 'sent',
    event_occurred_at: new Date().toISOString(),
    fame: 0,
    payload: input.payload,
  })
}

export async function sendKillbotTestMessage(
  db: SupabaseClient,
  guildId: string,
  options?: SendKillbotTestMessageOptions | string | null,
): Promise<{ channelId: string; discordMessageId: string }> {
  const {
    channelIdOverride,
    kind: requestedKind,
    configOverride,
  } = normalizeKillbotTestMessageOptions(options)
  const [storedConfig, target] = await Promise.all([
    getKillbotConfig(db, guildId),
    loadKillbotTarget(db, guildId),
  ])
  const config = applyKillbotTestConfigOverride(storedConfig, configOverride)
  const kind =
    requestedKind ?? (isBattleFeedEnabled(config.feedMode) ? 'battle' : 'event')
  const channelId = resolveKillbotTestChannelId(config, kind, channelIdOverride)
  if (!channelId) throw new Error('killbot channel is not configured')

  if (kind === 'battle') {
    const [candidate] = await loadKillbotBattleCandidates(
      db,
      config,
      target,
      new Date().toISOString(),
      {
        lookbackMs: KILLBOT_BATTLE_TEST_LOOKBACK_MS,
        ascending: false,
        limit: 80,
        includeUnsettled: true,
      },
    ).catch(() => [])
    const summary = candidate?.summary ?? buildKillbotBattleTestSummary(config, target)
    const message = await buildKillbotBattleDiscordMessage(
      summary,
      { ...config, mentionRoleId: null },
      target,
    )
    const discordMessageId = await sendDiscordChannelMessage(channelId, message)
    await insertKillbotTestDelivery(db, {
      guildId,
      channelId,
      discordMessageId,
      kind,
      payload: message.payload as unknown as Record<string, unknown>,
    })
    await updateConfigRuntimeStatus(db, guildId, {
      lastSentAt: new Date().toISOString(),
      lastError: null,
    })
    return { channelId, discordMessageId }
  }

  const testGuildName = target.homeGuildName || 'Configured guild'
  const sampleValueEstimate: KillbotVictimValueEstimate = {
    totalSilver: 12_450_000,
    gearSilver: 10_800_000,
    inventorySilver: 1_650_000,
    totalItems: 17,
    pricedItems: 17,
    missingItems: 0,
    isPartial: false,
  }
  const message = await buildKillbotDiscordMessage(
    {
      EventId: Date.now(),
      TimeStamp: new Date().toISOString(),
      TotalVictimKillFame: config.juicyFameThreshold || DEFAULT_JUICY_FAME,
      BattleId: 123456789,
      Killer: {
        Name: testGuildName,
        GuildName: testGuildName,
        GuildId: target.homeGuildId || 'home-guild',
        AverageItemPower: 1794,
        Equipment: {
          MainHand: { Type: 'T8_MAIN_HOLYSTAFF@3' },
          OffHand: { Type: 'T8_OFF_BOOK@2' },
          Head: { Type: 'T8_HEAD_CLOTH_SET3@2' },
          Armor: { Type: 'T8_ARMOR_CLOTH_SET3@2' },
          Shoes: { Type: 'T8_SHOES_CLOTH_SET3@2' },
          Cape: { Type: 'T8_CAPEITEM_FW_LYMHURST' },
          Bag: { Type: 'T8_BAG' },
          Mount: { Type: 'T8_MOUNT_HORSE_UNDEAD' },
          Potion: { Type: 'T8_POTION_HEAL', Count: 5 },
          Food: { Type: 'T8_MEAL_OMELETTE', Count: 3 },
        },
      },
      Victim: {
        Name: 'Enemy Player',
        GuildName: 'Enemy Guild',
        GuildId: 'enemy-guild',
        AverageItemPower: 1562,
        Equipment: {
          MainHand: { Type: 'T8_2H_CLAYMORE_AVALON@2' },
          OffHand: { Type: 'T8_OFF_SHIELD@1' },
          Head: { Type: 'T8_HEAD_PLATE_SET3@2' },
          Armor: { Type: 'T8_ARMOR_PLATE_SET3@2' },
          Shoes: { Type: 'T8_SHOES_PLATE_SET3@2' },
          Cape: { Type: 'T8_CAPEITEM_FW_LYMHURST' },
          Mount: { Type: 'T8_MOUNT_HORSE_UNDEAD' },
          Potion: { Type: 'T8_POTION_HEAL' },
          Food: { Type: 'T8_MEAL_OMELETTE' },
        },
        Inventory: [
          { Type: 'T8_BAG', Count: 1 },
          { Type: 'T8_CAPEITEM_FW_LYMHURST', Count: 1 },
          { Type: 'T8_MAIN_HOLYSTAFF@3', Count: 1 },
          { Type: 'T8_POTION_HEAL', Count: 3 },
          { Type: 'T8_MEAL_OMELETTE', Count: 2 },
          { Type: 'T8_RUNE', Count: 12 },
          { Type: 'T8_SOUL', Count: 8 },
          { Type: 'T8_RELIC', Count: 4 },
        ],
      },
    },
    {
      feedType: 'kill',
      fame: config.juicyFameThreshold || DEFAULT_JUICY_FAME,
      isJuicy: true,
      killerName: testGuildName,
      victimName: 'Enemy Player',
    },
    { ...config, mentionRoleId: null },
    target,
    sampleValueEstimate,
  )
  const payload = { ...message.payload, content: undefined }
  const firstEmbed = payload.embeds[0]
  if (!firstEmbed) throw new Error('killbot test payload missing embed')
  payload.embeds[0] = {
    ...firstEmbed,
    title: 'AlbionGuildManager Killbot test',
    description: [
      target.homeGuildName
        ? `Notifications are ready for ${target.homeGuildName}.`
        : 'Notification delivery works, but the Albion home guild is not configured yet.',
      `Server ${target.server ?? 'Not configured'} · Channel <#${channelId}>`,
    ].join('\n'),
    fields: undefined,
  }
  const testMessage = { ...message, payload }

  const discordMessageId = await sendDiscordChannelMessage(channelId, testMessage)
  await insertKillbotTestDelivery(db, {
    guildId,
    channelId,
    discordMessageId,
    kind,
    payload,
  })
  await updateConfigRuntimeStatus(db, guildId, {
    lastSentAt: new Date().toISOString(),
    lastError: null,
  })
  return { channelId, discordMessageId }
}
