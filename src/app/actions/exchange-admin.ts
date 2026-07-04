'use server'

// 환전 신청 + 역할 보상 액션. 리기어와 같은 어드민 승인 흐름 (approvals)
// 화면에서 함께 노출되어 한 모듈로 묶었다. 리기어 mutation/list 는
// `./regear-admin-resolve` / `./regear-admin-list` 분리 모듈에 있다.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  APPROVAL_REVIEW_CAPS,
  EXCHANGE_REVIEW_CAPS,
} from '@/lib/admin-approval-permissions'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { formatSilver } from '@/lib/silver'
import { logAdminAction } from '@/lib/admin-audit'
import { getPointBalancesByMember } from '@/lib/point-ledger'
import { isPostgresNonNegativeInt } from '@/lib/postgres-int'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import {
  normalizeRolePayoutRatePercent,
  normalizeRoleRewardName,
  type AdminExchangeRequest,
  type RoleReward,
} from './regear-admin-types'

interface ExchangeRequestRow {
  id: string
  discord_id: string
  username: string
  silver: number
  status: string
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
}

export async function listExchangeRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminExchangeRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAnyCapability(EXCHANGE_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const page = await selectPagedRows<ExchangeRequestRow>({
      label: 'exchange requests',
      buildQuery: () => {
        let query = db
          .from('exchange_requests')
          .select(
            'id, discord_id, username, silver, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username',
          )
          .eq('guild_id', guildId)
        if (scope === 'pending') query = query.eq('status', 'pending')
        return query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }) as unknown as SupabasePagedQuery<ExchangeRequestRow>
      },
    })
    if (page.error) return { requests: [], error: page.error }

    // Attach balance per user — a small N+1 that's fine at admin-scale volume.
    const rows = page.rows
    const uniqueIds = Array.from(new Set(rows.map((r) => r.discord_id)))
    const { balances, error: balancesError } =
      await getPointBalancesByMember(db, guildId, uniqueIds)
    if (balancesError) return { requests: [], error: balancesError }

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
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(EXCHANGE_REVIEW_CAPS)
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
    revalidatePath('/', 'layout')
    const { data: row } = await db
      .from('exchange_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendLocalizedDiscordDmToUser(row.discord_id, guildId, (tDm) => ({
        title: tDm('exchangeApprovedTitle'),
        body: tDm('exchangeApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      }))
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'exchange.approve',
      targetId: id,
      targetKind: 'exchange',
      targetDiscordId: row?.discord_id ?? null,
      details: { silver: row?.silver ?? 0 },
    })
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
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(EXCHANGE_REVIEW_CAPS)
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
    revalidatePath('/', 'layout')
    const { data: row } = await db
      .from('exchange_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendLocalizedDiscordDmToUser(row.discord_id, guildId, (tDm) => ({
        title: tDm('exchangeRejectedTitle'),
        body: tDm('exchangeRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      }))
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'exchange.reject',
      targetId: id,
      targetKind: 'exchange',
      targetDiscordId: row?.discord_id ?? null,
      details: { silver: row?.silver ?? 0, notes: notes.trim() || null },
    })
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
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('role_rewards')
      .select('role_name, silver, payout_rate_percent, updated_at')
      .eq('guild_id', guildId)
      .order('role_name')
    if (error) return { rewards: [], error: error.message }
    return {
      rewards: ((data ?? []) as RoleReward[]).map((reward) => ({
        role_name: reward.role_name,
        silver: reward.silver,
        payout_rate_percent: reward.payout_rate_percent ?? null,
        updated_at: reward.updated_at,
      })),
    }
  } catch (e) {
    return { rewards: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateRoleReward(
  roleName: string,
  silver: number,
  payoutRatePercent?: number | null,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const normalizedRoleName = normalizeRoleRewardName(roleName)
    if (!normalizedRoleName) {
      return { error: tErr('roleNameRequired') }
    }
    if (!isPostgresNonNegativeInt(silver)) {
      return { error: tErr('nonNegativeInteger') }
    }
    const normalizedRate = normalizeRolePayoutRatePercent(payoutRatePercent)
    if (normalizedRate === 'invalid') {
      return { error: tErr('invalidIntegerRange', { min: 1, max: 100 }) }
    }
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('role_rewards')
      .upsert(
        {
          guild_id: guildId,
          role_name: normalizedRoleName,
          silver,
          payout_rate_percent: normalizedRate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guild_id,role_name' },
      )
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    revalidatePath('/admin/dashboard/approvals')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'role_reward.update',
      targetId: normalizedRoleName,
      targetKind: 'role_reward',
      details: { roleName: normalizedRoleName, silver, payoutRatePercent: normalizedRate },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteRoleReward(roleName: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const normalizedRoleName = normalizeRoleRewardName(roleName)
    if (!normalizedRoleName) {
      return { error: tErr('roleNameRequired') }
    }
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('role_rewards')
      .delete()
      .eq('guild_id', guildId)
      .eq('role_name', normalizedRoleName)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    revalidatePath('/admin/dashboard/approvals')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'role_reward.delete',
      targetId: normalizedRoleName,
      targetKind: 'role_reward',
      details: { roleName: normalizedRoleName },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
