'use server'


import { publicActionError } from '@/lib/public-action-error'
// 리기어 신청 조회 + 이상치 감지. approve/reject 같은 mutation 은
// `./regear-admin-resolve` 에 분리. 두 모듈은 같은 type/const/helper 를
// `./regear-admin-types` 에서 공유.

import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import {
  computeRegearAnomalies,
  type RegearAnomalyFlag,
} from '@/lib/regear-anomaly'
import { isRegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type { BuildSnapshot, RegearType } from '@/types'
import {
  loadPayoutRatePercent,
  loadVideoPayoutRatePercent,
  SCREENSHOT_BUCKET,
  SCREENSHOT_URL_TTL_SECONDS,
  type AdminRegearRequest,
  type RegearRelationCounts,
  type RegearRelationFilter,
  type RegearOrigin,
  type RegearOriginCounts,
} from './regear-admin-types'
import { isAlbionIdentityRelation } from '@/lib/account-albion-identity'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import { normalizeCraftRegearSlots } from '@/lib/regear-craft-slots'
import { resolveRegearPayoutRatePercent } from '@/lib/regear-payout'
import {
  parseRegearPolicySnapshot,
  resolveSnapshotPayoutRatePercent,
} from '@/lib/regear-event-policy'
import { getRegearOriginFilterSpec } from '@/lib/regear-origin-filter'
import { isRegearParticipantConfirmationStatus } from '@/lib/regear-participant-confirmation'

const REGEAR_REVIEW_CAPS = [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface RegearRequestListRow {
  id: string
  event_id: string | null
  regear_window_id: string | null
  regear_origin_type: string
  event_title_snapshot: string | null
  discord_id: string
  username: string
  requester_relation: string | null
  role_name: string
  base_silver: number | null
  silver: number
  regear_role_group: string | null
  regear_role_policy_enabled: boolean | null
  regear_role_policy_match_status: string | null
  regear_role_policy_discord_role_id: string | null
  regear_role_policy_discord_role_name: string | null
  regear_role_policy_silver_cap: number | null
  request_type: string | null
  claimed_silver: number
  payout_silver: number | null
  video_proof_url: string | null
  video_proof_title: string | null
  regear_policy_snapshot: unknown
  screenshot_path: string | null
  screenshot_path_2: string | null
  killboard_verified: boolean
  killboard_event_id: number | null
  status: string
  participant_confirmation_status: string | null
  admin_notes: string | null
  reject_reason_code: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
  build_snapshot: unknown
  craft_requested_slots: unknown
  craft_included_slots: unknown
  gear_breakdown: unknown
  auto_generated: boolean | null
  price_warning_level: string | null
  fulfillment_mode: string | null
  events: { title?: string } | { title?: string }[] | null
}

export async function listRegearRequests(
  scope: 'pending' | 'all' = 'pending',
  origin: RegearOrigin = 'all',
  relation: RegearRelationFilter = 'all',
  eventId: string | null = null,
): Promise<{ requests: AdminRegearRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    if (eventId !== null && !UUID_RE.test(eventId)) {
      return { requests: [], error: tErr('invalidInput') }
    }
    const page = await selectPagedRows<RegearRequestListRow>({
      label: 'regear requests',
      buildQuery: () => {
        let query = db
          .from('regear_requests')
          .select(
            'id, event_id, regear_window_id, regear_origin_type, event_title_snapshot, discord_id, username, requester_relation, role_name, base_silver, silver, regear_role_group, regear_role_policy_enabled, regear_role_policy_match_status, regear_role_policy_discord_role_id, regear_role_policy_discord_role_name, regear_role_policy_silver_cap, request_type, claimed_silver, payout_silver, video_proof_url, video_proof_title, regear_policy_snapshot, screenshot_path, screenshot_path_2, killboard_verified, killboard_event_id, status, participant_confirmation_status, admin_notes, reject_reason_code, created_at, resolved_at, handled_by, handled_by_username, build_snapshot, craft_requested_slots, craft_included_slots, gear_breakdown, auto_generated, price_warning_level, fulfillment_mode, events(title)',
          )
          .eq('guild_id', guildId)
        if (scope === 'pending') query = query.eq('status', 'pending')
        const originFilter = getRegearOriginFilterSpec(origin)
        if (originFilter) query = query.eq('regear_origin_type', originFilter.value)
        if (relation !== 'all') query = query.eq('requester_relation', relation)
        if (eventId) query = query.eq('event_id', eventId)
        return query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }) as unknown as SupabasePagedQuery<RegearRequestListRow>
      },
    })
    if (page.error) return { requests: [], error: page.error }
    const data = page.rows
    const [baseRatePercent, videoRatePercent] = await Promise.all([
      loadPayoutRatePercent(guildId),
      loadVideoPayoutRatePercent(guildId),
    ])
    const roleNames = Array.from(
      new Set(
        data
          .map((row) => row.role_name?.trim())
          .filter((roleName): roleName is string => Boolean(roleName)),
      ),
    )
    const roleRateByName = new Map<string, number | null>()
    if (roleNames.length > 0) {
      const { data: roleRows } = await db
        .from('role_rewards')
        .select('role_name, payout_rate_percent')
        .eq('guild_id', guildId)
        .in('role_name', roleNames)
      for (const row of (roleRows ?? []) as Array<{
        role_name: string
        payout_rate_percent: number | null
      }>) {
        roleRateByName.set(row.role_name, row.payout_rate_percent)
      }
    }

    // killboard_event_id → victim row 의 핵심 컬럼만 보조 fetch. 자동·추적사망
    // 건은 screenshot 이 없어 카드에 "어떤 사망인지" 단서가 부족했다.
    // killboard_events 자연키는 (guild_id, event_id, role) 이므로 guild_id +
    // role='victim' 으로 좁힌 후 event_id 합집합을 만든다.
    const kbEventIds = Array.from(
      new Set(
        (data ?? [])
          .map((r) => r.killboard_event_id as number | null)
          .filter((v): v is number => typeof v === 'number'),
      ),
    )
    const killSummaryByEventId = new Map<number, AdminRegearRequest['kill_summary']>()
    if (kbEventIds.length > 0) {
      const { data: kbRows } = await db
        .from('killboard_events')
        .select('event_id, opponent_name, opponent_guild, fame, item_power, occurred_at')
        .eq('guild_id', guildId)
        .eq('role', 'victim')
        .in('event_id', kbEventIds)
      for (const kb of (kbRows ?? []) as Array<{
        event_id: number
        opponent_name: string | null
        opponent_guild: string | null
        fame: number
        item_power: number | null
        occurred_at: string
      }>) {
        killSummaryByEventId.set(kb.event_id, {
          opponent_name: kb.opponent_name,
          opponent_guild: kb.opponent_guild,
          fame: kb.fame,
          item_power: kb.item_power,
          occurred_at: kb.occurred_at,
        })
      }
    }

    const deletedEventLabel = tErr('deletedEvent')
    const requests: AdminRegearRequest[] = (data ?? []).map((row) => {
      const event = row.events as { title?: string } | { title?: string }[] | null
      const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
      const breakdown = row.gear_breakdown as
        | { market_silver?: unknown; items?: unknown }
        | null
      const marketRaw = breakdown?.market_silver
      const estimatedSilver =
        typeof marketRaw === 'number' && Number.isFinite(marketRaw) && marketRaw > 0
          ? Math.trunc(marketRaw)
          : null
      const rawItems = Array.isArray(breakdown?.items) ? breakdown.items : []
      const snapshot = parseRegearPolicySnapshot(row.regear_policy_snapshot)
      const fallbackPayoutRatePercent = resolveRegearPayoutRatePercent({
        baseRatePercent,
        roleRatePercent: roleRateByName.get(row.role_name) ?? null,
        videoRatePercent,
        hasVideoProof: Boolean(row.video_proof_url),
      })
      const breakdownItems = rawItems
        .filter(
          (v): v is Record<string, unknown> =>
            typeof v === 'object' && v !== null,
        )
        .map((v) => ({
          slot: typeof v.slot === 'string' ? v.slot : '',
          unique_name: typeof v.uniqueName === 'string' ? v.uniqueName : '',
          enchant:
            typeof v.enchant === 'number' && Number.isFinite(v.enchant)
              ? Math.trunc(v.enchant)
              : 0,
          quality:
            typeof v.quality === 'number' && Number.isFinite(v.quality)
              ? Math.trunc(v.quality)
              : 1,
          count:
            typeof v.count === 'number' && Number.isFinite(v.count) && v.count > 0
              ? Math.trunc(v.count)
              : 1,
          price:
            typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0
              ? Math.trunc(v.price)
              : null,
          city: typeof v.city === 'string' ? v.city : null,
          fallback_tier: typeof v.fallbackTier === 'string' ? v.fallbackTier : null,
          user_edited: v.userEdited === true,
        }))
        .filter((it) => it.slot.length > 0)
      return {
        id: row.id,
        event_id: row.event_id ?? '',
        regear_window_id: row.regear_window_id ?? null,
        origin:
          row.regear_origin_type === 'auto' ||
          row.regear_origin_type === 'free_window'
            ? row.regear_origin_type
            : 'event',
        event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
        discord_id: row.discord_id,
        username: row.username,
        requester_relation: isAlbionIdentityRelation(row.requester_relation)
          ? row.requester_relation
          : 'home_guild',
        role_name: row.role_name,
        base_silver:
          typeof row.base_silver === 'number' && Number.isFinite(row.base_silver)
            ? Math.trunc(row.base_silver)
            : null,
        silver: row.silver,
        regear_role_group: row.regear_role_group ?? null,
        regear_role_policy_enabled: row.regear_role_policy_enabled === true,
        regear_role_policy_match_status: row.regear_role_policy_match_status ?? 'disabled',
        regear_role_policy_discord_role_id: row.regear_role_policy_discord_role_id ?? null,
        regear_role_policy_discord_role_name: row.regear_role_policy_discord_role_name ?? null,
        regear_role_policy_silver_cap: row.regear_role_policy_silver_cap ?? null,
        request_type: (row.request_type ?? 'death') as RegearType,
        claimed_silver: row.claimed_silver,
        payout_silver: row.payout_silver ?? null,
        video_proof_url: row.video_proof_url ?? null,
        video_proof_title: row.video_proof_title ?? null,
        payout_rate_percent: resolveSnapshotPayoutRatePercent(
          snapshot,
          Boolean(row.video_proof_url),
          fallbackPayoutRatePercent,
        ),
        screenshot_path: row.screenshot_path ?? null,
        screenshot_path_2: row.screenshot_path_2 ?? null,
        killboard_verified: row.killboard_verified,
        killboard_event_id: row.killboard_event_id,
        status: row.status as AdminRegearRequest['status'],
        participant_confirmation_status: isRegearParticipantConfirmationStatus(
          row.participant_confirmation_status,
        )
          ? row.participant_confirmation_status
          : 'not_required',
        admin_notes: row.admin_notes,
        reject_reason_code: isRegearRejectReasonCode(row.reject_reason_code)
          ? row.reject_reason_code
          : null,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        handled_by: row.handled_by ?? null,
        handled_by_username: row.handled_by_username ?? null,
        build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
        craft_requested_slots: normalizeCraftRegearSlots(row.craft_requested_slots, false),
        craft_included_slots: Array.isArray(row.craft_included_slots)
          ? normalizeCraftRegearSlots(row.craft_included_slots, false)
          : null,
        estimated_silver: estimatedSilver,
        price_warning_level:
          (row.price_warning_level as AdminRegearRequest['price_warning_level']) ?? null,
        auto_generated: Boolean(row.auto_generated),
        breakdown_items: breakdownItems,
        fulfillment_mode:
          row.fulfillment_mode === 'crafted' || row.fulfillment_mode === 'stocked'
            ? row.fulfillment_mode
            : 'silver',
        kill_summary:
          typeof row.killboard_event_id === 'number'
            ? killSummaryByEventId.get(row.killboard_event_id) ?? null
            : null,
      }
    })
    return { requests }
  } catch (e) {
    return { requests: [], error: await publicActionError(e, 'actions/regear-admin-list') }
  }
}

// 어드민 승인 화면 origin 탭 라벨에 표시할 건수. 현재 scope (pending/all) 와
// 동일한 필터를 적용해 "지금 보고 있는 목록 기준의 분포" 가 되도록 한다.
export async function getRegearOriginCounts(
  scope: 'pending' | 'all' = 'pending',
  relation: RegearRelationFilter = 'all',
  eventId: string | null = null,
): Promise<{ counts: RegearOriginCounts; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) {
      return {
        counts: { event: 0, free_window: 0, auto: 0, all: 0 },
        error: tErr('unauthorized'),
      }
    }
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    if (eventId !== null && !UUID_RE.test(eventId)) {
      return {
        counts: { event: 0, free_window: 0, auto: 0, all: 0 },
        error: tErr('invalidInput'),
      }
    }
    const baseQuery = () => {
      let q = db
        .from('regear_requests')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
      if (scope === 'pending') q = q.eq('status', 'pending')
      if (relation !== 'all') q = q.eq('requester_relation', relation)
      if (eventId) q = q.eq('event_id', eventId)
      return q
    }
    const [eventRes, freeWindowRes, autoRes] = await Promise.all([
      baseQuery().eq('regear_origin_type', 'event'),
      baseQuery().eq('regear_origin_type', 'free_window'),
      baseQuery().eq('regear_origin_type', 'auto'),
    ])
    const countError = eventRes.error ?? freeWindowRes.error ?? autoRes.error
    if (countError) {
      return {
        counts: { event: 0, free_window: 0, auto: 0, all: 0 },
        error: await publicActionError(countError, 'actions/regear-admin-list'),
      }
    }
    const event = eventRes.count ?? 0
    const free_window = freeWindowRes.count ?? 0
    const auto = autoRes.count ?? 0
    return {
      counts: {
        event,
        free_window,
        auto,
        all: event + free_window + auto,
      },
    }
  } catch (e) {
    return {
      counts: { event: 0, free_window: 0, auto: 0, all: 0 },
      error: await publicActionError(e, 'actions/regear-admin-list'),
    }
  }
}

export async function getRegearRelationCounts(
  scope: 'pending' | 'all' = 'pending',
  origin: RegearOrigin = 'all',
  eventId: string | null = null,
): Promise<{ counts: RegearRelationCounts; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) {
      return {
        counts: { home_guild: 0, alliance: 0, all: 0 },
        error: tErr('unauthorized'),
      }
    }
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    if (eventId !== null && !UUID_RE.test(eventId)) {
      return {
        counts: { home_guild: 0, alliance: 0, all: 0 },
        error: tErr('invalidInput'),
      }
    }
    const baseQuery = () => {
      let q = db
        .from('regear_requests')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
      if (scope === 'pending') q = q.eq('status', 'pending')
      const originFilter = getRegearOriginFilterSpec(origin)
      if (originFilter) q = q.eq('regear_origin_type', originFilter.value)
      if (eventId) q = q.eq('event_id', eventId)
      return q
    }
    const [allRes, homeRes, allianceRes] = await Promise.all([
      baseQuery(),
      baseQuery().eq('requester_relation', 'home_guild'),
      baseQuery().eq('requester_relation', 'alliance'),
    ])
    if (allRes.error) {
      return {
        counts: { home_guild: 0, alliance: 0, all: 0 },
        error: await publicActionError(allRes.error, 'actions/regear-admin-list'),
      }
    }
    if (homeRes.error) {
      return {
        counts: { home_guild: 0, alliance: 0, all: 0 },
        error: await publicActionError(homeRes.error, 'actions/regear-admin-list'),
      }
    }
    if (allianceRes.error) {
      return {
        counts: { home_guild: 0, alliance: 0, all: 0 },
        error: await publicActionError(allianceRes.error, 'actions/regear-admin-list'),
      }
    }
    const homeGuild = homeRes.count ?? 0
    const alliance = allianceRes.count ?? 0
    return { counts: { home_guild: homeGuild, alliance, all: allRes.count ?? 0 } }
  } catch (e) {
    return {
      counts: { home_guild: 0, alliance: 0, all: 0 },
      error: await publicActionError(e, 'actions/regear-admin-list'),
    }
  }
}

export async function getScreenshotUrl(path: string): Promise<{ url?: string; error?: string }> {
  try {
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const { data, error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, SCREENSHOT_URL_TTL_SECONDS)
    if (error) return { error: await publicActionError(error, 'actions/regear-admin-list') }
    return { url: data.signedUrl }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/regear-admin-list') }
  }
}

// 이상치 감지에 필요한 cross-request context 를 한 번에 조회.
// pending 요청들에 대해서만 계산 (승인된 건은 이미 처리됐으므로).
// 반환: 요청 id → RegearAnomalyFlag[]
const ANOMALY_LOOKBACK_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export async function getRegearAnomalyMap(
  requests: AdminRegearRequest[],
): Promise<Record<string, RegearAnomalyFlag[]>> {
  const pending = requests.filter((r) => r.status === 'pending')
  if (pending.length === 0) return {}

  try {
    const session = await getSession()
    if (!session) return {}
    const db = await requireAnyCapability(REGEAR_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)

    // 1) 청구자별 최근 7일 승인 건수. 현재 pending 은 status 필터로 자동 제외.
    const discordIds = [...new Set(pending.map((r) => r.discord_id))]
    const cutoff = new Date(Date.now() - ANOMALY_LOOKBACK_DAYS * DAY_MS).toISOString()
    const { data: recentApprovedRows } = await db
      .from('regear_requests')
      .select('discord_id')
      .eq('guild_id', guildId)
      .eq('status', 'approved')
      .in('discord_id', discordIds)
      .gte('resolved_at', cutoff)

    const approvedCount = new Map<string, number>()
    for (const row of recentApprovedRows ?? []) {
      if (!row.discord_id) continue
      approvedCount.set(row.discord_id, (approvedCount.get(row.discord_id) ?? 0) + 1)
    }

    // 2) (event_id, discord_id) 조합의 pending+approved 건수. 중복 감지용.
    const sameEventKey = (eventId: string, discordId: string) =>
      `${eventId}::${discordId}`
    const sameEventCount = new Map<string, number>()
    // pending 은 이미 목록에 있으므로 approved 만 추가로 조회.
    const eventIds = [...new Set(pending.map((r) => r.event_id).filter(Boolean))]
    if (eventIds.length > 0) {
      const { data: sameEventRows } = await db
        .from('regear_requests')
        .select('event_id, discord_id, status')
        .eq('guild_id', guildId)
        .in('event_id', eventIds)
        .in('discord_id', discordIds)
        .in('status', ['pending', 'approved'])
      for (const row of sameEventRows ?? []) {
        if (!row.event_id || !row.discord_id) continue
        const key = sameEventKey(row.event_id, row.discord_id)
        sameEventCount.set(key, (sameEventCount.get(key) ?? 0) + 1)
      }
    }

    const result: Record<string, RegearAnomalyFlag[]> = {}
    for (const request of pending) {
      const userApprovedCount7d = approvedCount.get(request.discord_id) ?? 0
      const sameEvent =
        request.event_id
          ? sameEventCount.get(sameEventKey(request.event_id, request.discord_id)) ?? 1
          : 1
      const flags = computeRegearAnomalies(request, {
        userApprovedCount7d,
        sameEventCount: sameEvent,
      })
      if (flags.length > 0) result[request.id] = flags
    }
    return result
  } catch {
    return {}
  }
}
