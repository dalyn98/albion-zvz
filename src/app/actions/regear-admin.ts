'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'
import { getAppSetting } from '@/lib/app-settings'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { verifyDeathInWindow } from '@/lib/killboard'
import { estimateSilverFromEquipment } from '@/lib/regear-estimate'
import {
  computeRegearAnomalies,
  type RegearAnomalyFlag,
} from '@/lib/regear-anomaly'
import type { BuildSnapshot, RegearType } from '@/types'

const DEFAULT_PAYOUT_RATE_PERCENT = 100

// Read once and normalise. Centralised so admin action and UI loaders return
// the same number even if the DB row is malformed — 100% is the safe default
// since it matches the legacy "pay the full claim" behaviour.
async function loadPayoutRatePercent(): Promise<number> {
  const raw = await getAppSetting('regear_payout_rate_percent', String(DEFAULT_PAYOUT_RATE_PERCENT))
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return DEFAULT_PAYOUT_RATE_PERCENT
  }
  return parsed
}

// Exposed so the review UI can show "청구 X → 지급 Y (Z%)" without calling
// the RPC path. The pure rounding helper lives in `@/lib/regear-payout`.
export async function getRegearPayoutRatePercent(): Promise<number> {
  return loadPayoutRatePercent()
}

const SCREENSHOT_BUCKET = 'regear-screenshots'
// Signed URLs only need to live long enough for an admin to review. 10 min.
const SCREENSHOT_URL_TTL_SECONDS = 10 * 60

export interface AdminRegearRequest {
  id: string
  event_id: string
  event_title: string
  discord_id: string
  username: string
  role_name: string
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  // Actual credited amount for approved rows (rate × claimed, floor). NULL for
  // pending/rejected. Migration 044 adds and backfills the column.
  payout_silver: number | null
  // null once the retention window (48h after resolve) has expired.
  screenshot_path: string | null
  // 선택 사항 (migration 061). 데스당 2번째 스크린샷을 올린 경우에만 값이 있다.
  screenshot_path_2: string | null
  killboard_verified: boolean
  killboard_event_id: number | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  // 처리한 관리자 Discord ID + 당시 표시명 스냅샷. 마이그 040 이전 row 는 null.
  handled_by: string | null
  handled_by_username: string | null
  build_snapshot: BuildSnapshot | null
  // 킬보드 장비 + AODP 시세로 추산한 시장가. 자동 리기어와 관리자 재확인에서
  // 동일 포맷(gear_breakdown.market_silver) 으로 기록한다. null = 추산 없음.
  estimated_silver: number | null
  // AODP 폴백 단계 (migration 065). null = 경고 없음. 자동 리기어는 모든 건이
  // status='pending' 으로 들어오고(migration 067), 이 필드는 UI 가 색상 배지로
  // 시세 정확도 경고를 띄우는 데 쓰인다. status 결정에는 영향 없음.
  price_warning_level: 'quality' | 'window' | 'bluezone' | 'redzone' | null
  // 자동 생성 여부. 자동 건은 gear_breakdown 에 부위별 시세 breakdown 을 저장해
  // 관리자/청구자가 내역을 확인·수정할 수 있다.
  auto_generated: boolean
  // 자동 건일 경우 부위별 breakdown. 수동 건이거나 breakdown 이 없으면 빈 배열.
  // 청구자의 수정 여부(user_edited) 도 함께 노출해 관리자가 AODP 추정과 구분
  // 가능하도록 한다.
  breakdown_items: Array<{
    slot: string
    unique_name: string
    enchant: number
    quality: number
    count: number
    price: number | null
    city: string | null
    fallback_tier: string | null
    user_edited: boolean
  }>
}

export interface AdminExchangeRequest {
  id: string
  discord_id: string
  username: string
  silver: number
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
  balance: number
}

export interface RoleReward {
  role_name: string
  silver: number
  updated_at: string
}

export async function listRegearRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminRegearRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    let query = db
      .from('regear_requests')
      .select(
        'id, event_id, event_title_snapshot, discord_id, username, role_name, silver, request_type, claimed_silver, payout_silver, screenshot_path, screenshot_path_2, killboard_verified, killboard_event_id, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username, build_snapshot, gear_breakdown, auto_generated, price_warning_level, events(title)',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (scope === 'pending') query = query.eq('status', 'pending')

    const { data, error } = await query
    if (error) return { requests: [], error: error.message }

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
        event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
        discord_id: row.discord_id,
        username: row.username,
        role_name: row.role_name,
        silver: row.silver,
        request_type: (row.request_type ?? 'death') as RegearType,
        claimed_silver: row.claimed_silver,
        payout_silver: row.payout_silver ?? null,
        screenshot_path: row.screenshot_path ?? null,
        screenshot_path_2: row.screenshot_path_2 ?? null,
        killboard_verified: row.killboard_verified,
        killboard_event_id: row.killboard_event_id,
        status: row.status as AdminRegearRequest['status'],
        admin_notes: row.admin_notes,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        handled_by: row.handled_by ?? null,
        handled_by_username: row.handled_by_username ?? null,
        build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
        estimated_silver: estimatedSilver,
        price_warning_level:
          (row.price_warning_level as AdminRegearRequest['price_warning_level']) ?? null,
        auto_generated: Boolean(row.auto_generated),
        breakdown_items: breakdownItems,
      }
    })
    return { requests }
  } catch (e) {
    return { requests: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getScreenshotUrl(path: string): Promise<{ url?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const { data, error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, SCREENSHOT_URL_TTL_SECONDS)
    if (error) return { error: error.message }
    return { url: data.signedUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveRegearRequest(
  id: string,
  overrideSilver?: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    // Compute the actual credit using the current rate. RPC also clamps to
    // [0, claimed]; this client-side calc is for the DM body and the
    // approved row's payout_silver column. If the admin typed an explicit
    // override, use that value verbatim (clamped to [0, claimed] by the RPC
    // too — 재고 없는 신청은 위에서 거르고 들어옴).
    const { data: pending } = await db
      .from('regear_requests')
      .select('claimed_silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .eq('status', 'pending')
      .maybeSingle()
    const claimed = pending?.claimed_silver ?? 0
    const ratePercent = await loadPayoutRatePercent()
    const defaultPayout = calcPayoutSilver(claimed, ratePercent)
    let payout = defaultPayout
    if (typeof overrideSilver === 'number') {
      if (!Number.isInteger(overrideSilver) || overrideSilver < 0) {
        return { error: tErr('nonNegativeInteger') }
      }
      // 상한은 claimed (원래 청구한 실버) — RPC 가 다시 클램프하지만 사용자에게
      // 명확한 에러를 주기 위해 여기서도 검증.
      if (overrideSilver > claimed) {
        return { error: tErr('payoutExceedsClaim', { claimed: claimed.toLocaleString() }) }
      }
      payout = overrideSilver
    }
    const { error } = await db.rpc('approve_regear_request', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
      p_payout_silver: payout,
    })
    if (error) {
      if (error.message.includes('REGEAR_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/me')
    // 승인 직후 요청자에게 Discord DM. 실패해도 승인은 성공한 상태이므로 무시.
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot, payout_silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('regearApprovedTitle'),
        body: tDm('regearApprovedBody', {
          event: row.event_title_snapshot ?? '',
          silver: formatSilver(row.payout_silver ?? payout),
        }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 제출 시점엔 Albion API 가 아직 사망을 인덱싱하지 않아 killboard_verified 가
// false 로 굳는 경우가 흔하다 (API 지연 ~30분). 관리자가 시간 지난 뒤 이 액션을
// 눌러 최신 결과로 다시 채워넣을 수 있게 한다. pending 상태만 재확인 허용 —
// 이미 처리된 행은 감사 로그처럼 당시 상태를 보존.
export interface RecheckKillboardResult {
  killboard_verified: boolean
  killboard_event_id: number | null
  admin_notes: string | null
  // Market-based estimate from the matched death equipment. Only set when
  // verification succeeded AND AODP returned at least one price. `null` means
  // either the request isn't verified or we couldn't price any slot.
  estimated_silver: number | null
  error?: string
}

export async function recheckKillboardVerification(
  id: string,
): Promise<RecheckKillboardResult> {
  const tErr = await getTranslations('adminActionError')
  const empty: RecheckKillboardResult = {
    killboard_verified: false,
    killboard_event_id: null,
    admin_notes: null,
    estimated_silver: null,
  }
  try {
    const session = await getSession()
    if (!session) return { ...empty, error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select('username, status, event_id, events(battle_started_at)')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (fetchError) return { ...empty, error: fetchError.message }
    if (!row) return { ...empty, error: tErr('requestNotFound') }
    if (row.status !== 'pending') return { ...empty, error: tErr('alreadyHandled') }

    const event = row.events as
      | { battle_started_at: string | null }
      | { battle_started_at: string | null }[]
      | null
    const battleStartedAt = Array.isArray(event)
      ? event[0]?.battle_started_at ?? null
      : event?.battle_started_at ?? null
    if (!battleStartedAt) return { ...empty, error: tErr('battleNotStarted') }

    const result = await verifyDeathInWindow(
      row.username as string,
      battleStartedAt,
      new Date().toISOString(),
    )

    // 재확인이 성공하고 equipment 가 있으면 AODP 시세로 추산액을 계산.
    // 실패 케이스(equipment 없음, AODP 전부 null 등) 는 조용히 null 로 둔다 —
    // 기존 검증 로직을 막아선 안 되므로.
    let estimatedSilver: number | null = null
    let breakdown: Record<string, unknown> | null = null
    if (result.verified && result.matchedEquipment) {
      try {
        const estimate = await estimateSilverFromEquipment(result.matchedEquipment)
        if (estimate.marketSilver > 0) {
          estimatedSilver = estimate.marketSilver
        }
        breakdown = estimate.breakdown as unknown as Record<string, unknown>
      } catch {
        // AODP 실패는 재확인 전체를 실패시키지 않는다.
      }
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        killboard_verified: result.verified,
        killboard_event_id: result.matchedEventId,
        admin_notes: result.reason,
        gear_breakdown: breakdown,
      })
      .eq('guild_id', guildId)
      .eq('id', id)
      .eq('status', 'pending')
    if (updateError) return { ...empty, error: updateError.message }

    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return {
      killboard_verified: result.verified,
      killboard_event_id: result.matchedEventId,
      admin_notes: result.reason,
      estimated_silver: estimatedSilver,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function rejectRegearRequest(
  id: string,
  notes: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('reject_regear_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('REGEAR_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/me')
    const { data: row } = await db
      .from('regear_requests')
      .select('discord_id, event_title_snapshot')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('regearRejectedTitle'),
        body: tDm('regearRejectedBody', { event: row.event_title_snapshot ?? '' }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listExchangeRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminExchangeRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    let query = db
      .from('exchange_requests')
      .select(
        'id, discord_id, username, silver, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (scope === 'pending') query = query.eq('status', 'pending')
    const { data, error } = await query
    if (error) return { requests: [], error: error.message }

    // Attach balance per user — a small N+1 that's fine at admin-scale volume.
    const rows = data ?? []
    const balances = new Map<string, number>()
    const uniqueIds = Array.from(new Set(rows.map((r) => r.discord_id)))
    if (uniqueIds.length > 0) {
      const { data: ledger, error: ledgerError } = await db
        .from('point_ledger')
        .select('discord_id, delta')
        .eq('guild_id', guildId)
        .in('discord_id', uniqueIds)
      if (ledgerError) return { requests: [], error: ledgerError.message }
      for (const row of ledger ?? []) {
        balances.set(row.discord_id, (balances.get(row.discord_id) ?? 0) + row.delta)
      }
    }

    return {
      requests: rows.map((r) => ({
        id: r.id,
        discord_id: r.discord_id,
        username: r.username,
        silver: r.silver,
        status: r.status as AdminExchangeRequest['status'],
        admin_notes: r.admin_notes,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        handled_by: r.handled_by ?? null,
        handled_by_username: r.handled_by_username ?? null,
        balance: balances.get(r.discord_id) ?? 0,
      })),
    }
  } catch (e) {
    return { requests: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveExchangeRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('approve_exchange_request', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('EXCHANGE_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      if (error.message.includes('INSUFFICIENT_BALANCE')) {
        return { error: tErr('insufficientBalanceForExchange') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/exchanges')
    revalidatePath('/me')
    const { data: row } = await db
      .from('exchange_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('exchangeApprovedTitle'),
        body: tDm('exchangeApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function rejectExchangeRequest(
  id: string,
  notes: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('reject_exchange_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('EXCHANGE_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/exchanges')
    revalidatePath('/me')
    const { data: row } = await db
      .from('exchange_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('exchangeRejectedTitle'),
        body: tDm('exchangeRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listRoleRewards(): Promise<{
  rewards: RoleReward[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { rewards: [], error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('role_rewards')
      .select('role_name, silver, updated_at')
      .eq('guild_id', guildId)
      .order('role_name')
    if (error) return { rewards: [], error: error.message }
    return { rewards: (data ?? []) as RoleReward[] }
  } catch (e) {
    return { rewards: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateRoleReward(
  roleName: string,
  silver: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!Number.isInteger(silver) || silver < 0) {
      return { error: tErr('nonNegativeInteger') }
    }
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('role_rewards')
      .update({ silver, updated_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .eq('role_name', roleName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
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
    const db = await requireAdmin()
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
