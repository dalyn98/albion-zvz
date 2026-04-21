'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'
import type { BuildSnapshot, RegearType } from '@/types'

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
  // null once the retention window (48h after resolve) has expired.
  screenshot_path: string | null
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
    const db = await requireAdmin()
    let query = db
      .from('regear_requests')
      .select(
        'id, event_id, event_title_snapshot, discord_id, username, role_name, silver, request_type, claimed_silver, screenshot_path, killboard_verified, killboard_event_id, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username, build_snapshot, events(title)',
      )
      .order('created_at', { ascending: false })
    if (scope === 'pending') query = query.eq('status', 'pending')

    const { data, error } = await query
    if (error) return { requests: [], error: error.message }

    const deletedEventLabel = tErr('deletedEvent')
    const requests: AdminRegearRequest[] = (data ?? []).map((row) => {
      const event = row.events as { title?: string } | { title?: string }[] | null
      const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
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
        screenshot_path: row.screenshot_path ?? null,
        killboard_verified: row.killboard_verified,
        killboard_event_id: row.killboard_event_id,
        status: row.status as AdminRegearRequest['status'],
        admin_notes: row.admin_notes,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        handled_by: row.handled_by ?? null,
        handled_by_username: row.handled_by_username ?? null,
        build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
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

export async function approveRegearRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    const { error } = await db.rpc('approve_regear_request', {
      p_id: id,
      p_admin_id: session?.discordId ?? '',
      p_admin_username: session?.username ?? '',
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
      .select('discord_id, event_title_snapshot, claimed_silver')
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('regearApprovedTitle'),
        body: tDm('regearApprovedBody', {
          event: row.event_title_snapshot ?? '',
          silver: formatSilver(row.claimed_silver ?? 0),
        }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
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
    const { error } = await db.rpc('reject_regear_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session?.discordId ?? '',
      p_admin_username: session?.username ?? '',
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
    const db = await requireAdmin()
    let query = db
      .from('exchange_requests')
      .select(
        'id, discord_id, username, silver, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username',
      )
      .order('created_at', { ascending: false })
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
    const { error } = await db.rpc('approve_exchange_request', {
      p_id: id,
      p_admin_id: session?.discordId ?? '',
      p_admin_username: session?.username ?? '',
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
    const { error } = await db.rpc('reject_exchange_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session?.discordId ?? '',
      p_admin_username: session?.username ?? '',
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
    const db = await requireAdmin()
    const { data, error } = await db
      .from('role_rewards')
      .select('role_name, silver, updated_at')
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
    const db = await requireAdmin()
    const { error } = await db
      .from('role_rewards')
      .update({ silver, updated_at: new Date().toISOString() })
      .eq('role_name', roleName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
