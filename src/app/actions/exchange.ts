'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireCurrentMutationSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { isPostgresPositiveInt } from '@/lib/postgres-int'
import {
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from '@/lib/stable-member-ownership'

export interface MyExchangeRequest {
  id: string
  silver: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  held_points: number
  hold_status: 'legacy_unheld' | 'held' | 'consumed' | 'released'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
}

export async function requestExchange(silver: number): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }
  if (!isPostgresPositiveInt(silver)) {
    return { error: tErr('invalidAmount') }
  }
  const guildId = await getSessionGuildId(session)
  const albionError = await requireAlbionVerified(session.discordId, guildId)
  if (albionError) return { error: albionError }

  const db = getAdminClient()

  // Check balance — the DB unique-partial index blocks multiple pending
  // requests per user, and approve_exchange_request re-checks under lock,
  // so this is just a fast pre-validation for UX.
  const { spendable, error: balanceError } = await getMemberSpendablePointBalance(db, guildId, session.discordId)
  if (balanceError) return { error: balanceError }
  if (spendable < silver) {
    return { error: tErr('insufficientBalance', { balance: spendable.toLocaleString() }) }
  }

  const { data, error } = await db.rpc('submit_exchange_request', {
    p_guild_id: guildId,
    p_discord_id: session.discordId,
    p_username: session.username,
    p_silver: silver,
  })
  if (error) {
    if (error.message.includes('EXCHANGE_TEMPORARILY_RESTRICTED')) {
      return { error: tErr('exchangeTemporarilyRestricted') }
    }
    if (error.message.includes('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')) {
      return { error: tErr('exchangeRecentGameplayVideoRequired', { days: 5 }) }
    }
    if (error.message.includes('PENDING_EXCHANGE_EXISTS') || error.code === '23505') {
      return { error: tErr('pendingExchangeExists') }
    }
    if (error.message.includes('INSUFFICIENT_BALANCE')) {
      return { error: tErr('insufficientBalance', { balance: spendable.toLocaleString() }) }
    }
    return { error: await publicActionError(error, 'actions/exchange') }
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId,
    topic: 'exchange',
    sourceTable: 'exchange_requests',
    sourceId: data as string,
    title: tAdminNotify('exchangeTitle'),
    body: tAdminNotify('exchangeBody', {
      user: session.username,
      silver: silver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals?tab=exchange',
  })
  return { id: data as string }
}

export async function cancelMyExchangeRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  // Only pending rows owned by the caller can be cancelled. We check status
  // explicitly so a late request to cancel an already-approved row doesn't
  // silently delete ledger-adjacent state.
  const { data: row, error: fetchError } = await db
    .from('exchange_requests')
    .select('id, status, discord_id, guild_member_id')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: await publicActionError(fetchError, 'actions/exchange') }
  if (!row) return { error: tErr('requestNotFound') }
  const ownership = await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/exchange') }
  }
  if (!isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: session.discordId,
    rowGuildMemberId: row.guild_member_id,
    rowSubjectId: row.discord_id,
  })) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: cancelError } = await db.rpc('cancel_exchange_request', {
    p_id: id,
    p_guild_id: guildId,
    p_discord_id: row.discord_id,
  })
  if (cancelError) {
    if (cancelError.message.includes('EXCHANGE_NOT_PENDING')) {
      return { error: tErr('alreadyProcessedCannotCancel') }
    }
    return { error: await publicActionError(cancelError, 'actions/exchange') }
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/', 'layout')
  return {}
}

export async function updateMyExchangeRequest(
  id: string,
  silver: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }
  if (!isPostgresPositiveInt(silver)) {
    return { error: tErr('invalidAmount') }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('exchange_requests')
    .select('id, status, discord_id, guild_member_id')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: await publicActionError(fetchError, 'actions/exchange') }
  if (!row) return { error: tErr('requestNotFound') }
  const ownership = await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/exchange') }
  }
  if (!isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: session.discordId,
    rowGuildMemberId: row.guild_member_id,
    rowSubjectId: row.discord_id,
  })) return { error: tErr('onlyOwnEdit') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }

  const { error: updateError } = await db.rpc('update_exchange_request_hold', {
    p_id: id,
    p_guild_id: guildId,
    p_discord_id: row.discord_id,
    p_silver: silver,
  })
  if (updateError) {
    if (updateError.message.includes('INSUFFICIENT_BALANCE')) {
      const { spendable } = await getMemberSpendablePointBalance(
        db,
        guildId,
        session.discordId,
      )
      return { error: tErr('insufficientBalance', { balance: spendable.toLocaleString() }) }
    }
    if (updateError.message.includes('EXCHANGE_NOT_PENDING')) {
      return { error: tErr('alreadyProcessedCannotEdit') }
    }
    return { error: await publicActionError(updateError, 'actions/exchange') }
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/', 'layout')
  return {}
}

export async function listMyExchangeRequests(): Promise<{
  requests: MyExchangeRequest[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { requests: [], error: tErr('loginRequired') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { requests: [], error: tErr('localAccountResourceBlocked') }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const ownership = await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return {
      requests: [],
      error: await publicActionError(new Error(ownership.error), 'actions/exchange'),
    }
  }
  let query = db
    .from('exchange_requests')
    .select('id, silver, status, held_points, hold_status, admin_notes, created_at, resolved_at, handled_by_username')
    .eq('guild_id', guildId)
  query = ownership.guildMemberId
    ? query.eq('guild_member_id', ownership.guildMemberId)
    : query.eq('discord_id', session.discordId)
  const { data, error } = await query
    .order('created_at', { ascending: false })
  if (error) return { requests: [], error: await publicActionError(error, 'actions/exchange') }
  const requests: MyExchangeRequest[] = (data ?? []).map((row) => ({
    id: row.id,
    silver: row.silver,
    status: row.status as MyExchangeRequest['status'],
    held_points: Number(row.held_points) || 0,
    hold_status: row.hold_status as MyExchangeRequest['hold_status'],
    admin_notes: row.admin_notes,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    handled_by_username: row.handled_by_username ?? null,
  }))
  return { requests }
}
