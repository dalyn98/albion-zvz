import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppSetting } from '@/lib/app-settings'
import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import { type AlbionServer } from '@/lib/albion-gameinfo'
import { fetchJsonWithRetry } from '@/lib/http-retry'
import { resolveAlbionServer } from '@/lib/killboard'
import { tenantUrl } from '@/lib/tenant-resolver'
import type { EquipmentItem } from '@/lib/auto-regear-equipment'
import {
  estimateKillbotVictimValue,
  type KillbotVictimValueEstimate,
} from '@/lib/killbot-value'
import {
  buildKillbotDiscordMessage,
  sendDiscordChannelMessage,
} from '@/lib/killbot-discord'

export {
  buildKillbotDiscordMessage,
  buildKillbotDiscordPayload,
} from '@/lib/killbot-discord'

const KILLBOT_EVENTS_PAGE_LIMIT = 51
const KILLBOT_EVENTS_FETCH_LOOKBACK_MS = 20 * 60 * 1000
const KILLBOT_EVENTS_PROCESS_OVERLAP_MS = 8 * 60 * 1000
const KILLBOT_EVENTS_MAX_PAGES = 20
const DEFAULT_MIN_FAME = 1
const DEFAULT_JUICY_FAME = 1_000_000
const MAX_FAME_SETTING = 2_147_483_647

export type KillbotFeedType = 'kill' | 'death' | 'test'
export type KillbotDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface KillbotConfig {
  guildId: string
  enabled: boolean
  channelId: string | null
  minFame: number
  juicyFameThreshold: number
  includeKills: boolean
  includeDeaths: boolean
  mentionRoleId: string | null
  lastPolledAt: string | null
  lastSentAt: string | null
  lastError: string | null
  updatedAt: string | null
}

export interface KillbotDelivery {
  eventId: number
  feedType: KillbotFeedType
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
}

interface PlayerRef {
  Id?: string | null
  Name?: string | null
  GuildId?: string | null
  GuildName?: string | null
  AllianceId?: string | null
  AllianceName?: string | null
  AverageItemPower?: number | string | null
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
  feedType: Exclude<KillbotFeedType, 'test'>
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
  min_fame: number | null
  juicy_fame_threshold: number | null
  include_kills: boolean | null
  include_deaths: boolean | null
  mention_role_id: string | null
  last_polled_at: string | null
  last_sent_at: string | null
  last_error: string | null
  updated_at: string | null
}

interface KillbotDeliveryRow {
  event_id: number
  feed_type: KillbotFeedType
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
  channelId: string | null
  minFame: number
  juicyFameThreshold: number
  includeKills: boolean
  includeDeaths: boolean
  mentionRoleId?: string | null
}

interface FetchRecentKillbotEventsOptions {
  now?: Date
  lookbackMs?: number
  maxPages?: number
  pageLimit?: number
}

function defaultConfig(guildId: string): KillbotConfig {
  return {
    guildId,
    enabled: false,
    channelId: null,
    minFame: DEFAULT_MIN_FAME,
    juicyFameThreshold: DEFAULT_JUICY_FAME,
    includeKills: true,
    includeDeaths: true,
    mentionRoleId: null,
    lastPolledAt: null,
    lastSentAt: null,
    lastError: null,
    updatedAt: null,
  }
}

function rowToConfig(row: KillbotConfigRow): KillbotConfig {
  return {
    guildId: row.guild_id,
    enabled: row.enabled ?? false,
    channelId: row.channel_id ?? null,
    minFame: clampFameSetting(row.min_fame, DEFAULT_MIN_FAME),
    juicyFameThreshold: clampFameSetting(row.juicy_fame_threshold, DEFAULT_JUICY_FAME),
    includeKills: row.include_kills ?? true,
    includeDeaths: row.include_deaths ?? true,
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
    channelId: row.channel_id,
    discordMessageId: row.discord_message_id ?? null,
    status: row.status,
    error: row.error ?? null,
    eventOccurredAt: row.event_occurred_at ?? null,
    fame: Math.max(0, Number(row.fame ?? 0)),
    createdAt: row.created_at,
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
  return {
    enabled: !!input.enabled,
    channelId: normalizeSnowflake(input.channelId),
    minFame,
    juicyFameThreshold,
    includeKills: !!input.includeKills,
    includeDeaths: !!input.includeDeaths,
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
        min_fame: normalized.minFame,
        juicy_fame_threshold: normalized.juicyFameThreshold,
        include_kills: normalized.includeKills,
        include_deaths: normalized.includeDeaths,
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

export async function loadKillbotTarget(guildId: string): Promise<KillbotTarget> {
  const [serverResult, homeGuildId, homeGuildName] = await Promise.all([
    resolveAlbionServer(guildId).catch(() => null),
    getAppSetting('albion_home_guild_id', '', guildId),
    getAppSetting('albion_home_guild_name', '', guildId),
  ])
  return {
    server: serverResult,
    homeGuildId: homeGuildId.trim(),
    homeGuildName: homeGuildName.trim(),
  }
}

export async function loadKillbotAdminState(
  db: SupabaseClient,
  guildId: string,
): Promise<KillbotAdminState> {
  const [config, target, deliveriesResult] = await Promise.all([
    getKillbotConfig(db, guildId),
    loadKillbotTarget(guildId),
    db
      .from('killbot_deliveries')
      .select(
        'event_id, feed_type, channel_id, discord_message_id, status, error, event_occurred_at, fame, created_at',
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

async function reserveDelivery(
  db: SupabaseClient,
  guildId: string,
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  channelId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('killbot_deliveries')
    .upsert(
      {
        guild_id: guildId,
        event_id: Number(event.EventId),
        feed_type: match.feedType,
        channel_id: channelId,
        status: 'pending',
        error: null,
        event_occurred_at: eventTimeOrNull(event),
        fame: match.fame,
        payload: event as unknown as Record<string, unknown>,
      },
      {
        onConflict: 'guild_id,event_id,feed_type',
        ignoreDuplicates: true,
      },
    )
    .select('event_id')
  if (error) throw new Error(`killbot delivery reserve failed: ${error.message}`)
  return Array.isArray(data) && data.length > 0
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
  const { error } = await db
    .from('killbot_deliveries')
    .update({
      status: update.status,
      discord_message_id: update.discordMessageId ?? null,
      error: update.error ?? null,
    })
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('feed_type', feedType)
  if (error) throw new Error(`killbot delivery update failed: ${error.message}`)
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
    .not('channel_id', 'is', null)

  if (error) throw new Error(`killbot config list failed: ${error.message}`)
  const configs = ((data ?? []) as KillbotConfigRow[])
    .map(rowToConfig)
    .filter((config) => !!config.channelId)
  result.configs_total = configs.length

  const targets = await Promise.all(
    configs.map(async (config) => ({
      config,
      target: await loadKillbotTarget(config.guildId),
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
    if (!eventsByServer.has(target.server)) {
      const events = await fetchRecentKillbotEvents(target.server)
      eventsByServer.set(target.server, events.slice().reverse())
      result.events_fetched += events.length
    }
  }

  for (const { config, target } of targets) {
    const channelId = config.channelId
    if (!channelId || !target.server || (!target.homeGuildId && !target.homeGuildName)) {
      continue
    }
    result.tenants_ready += 1
    const polledAt = new Date().toISOString()
    const events = (eventsByServer.get(target.server) ?? []).filter((event) =>
      isKillbotEventInsideProcessWindow(event, config.lastPolledAt, polledAt),
    )
    let lastSentAt: string | null = null
    let lastError: string | null = null

    for (const event of events) {
      for (const match of classifyKillbotEvent(event, target, config)) {
        let reserved = false
        try {
          reserved = await reserveDelivery(db, config.guildId, event, match, channelId)
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
            channelId,
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

    await updateConfigRuntimeStatus(db, config.guildId, {
      lastPolledAt: polledAt,
      lastSentAt: lastSentAt ?? undefined,
      lastError,
    })
  }

  return result
}

export async function sendKillbotTestMessage(
  db: SupabaseClient,
  guildId: string,
  channelIdOverride?: string | null,
): Promise<{ channelId: string; discordMessageId: string }> {
  const [config, target] = await Promise.all([
    getKillbotConfig(db, guildId),
    loadKillbotTarget(guildId),
  ])
  const channelId = normalizeSnowflake(channelIdOverride) ?? config.channelId
  if (!channelId) throw new Error('killbot channel is not configured')

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
        Equipment: {
          MainHand: { Type: 'T8_MAIN_HOLYSTAFF@3' },
          Armor: { Type: 'T8_ARMOR_CLOTH_SET3@2' },
        },
      },
      Victim: {
        Name: 'Enemy Player',
        GuildName: 'Enemy Guild',
        GuildId: 'enemy-guild',
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
  const eventId = Date.now()
  await db.from('killbot_deliveries').insert({
    guild_id: guildId,
    event_id: eventId,
    feed_type: 'test',
    channel_id: channelId,
    discord_message_id: discordMessageId,
    status: 'sent',
    event_occurred_at: new Date().toISOString(),
    fame: 0,
    payload,
  })
  await updateConfigRuntimeStatus(db, guildId, {
    lastSentAt: new Date().toISOString(),
    lastError: null,
  })
  return { channelId, discordMessageId }
}
