'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { isPostgresPositiveInt } from '@/lib/postgres-int'

export interface MyExchangeRequest {
  id: string
  silver: number
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
}

export async function requestExchange(silver: number): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  const session = await getSession()
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

  const { data, error } = await db
    .from('exchange_requests')
    .insert({
      guild_id: guildId,
      discord_id: session.discordId,
      username: session.username,
      silver,
    })
    .select('id')
    .single()
  if (error) {
    // 23505 = unique violation → they already have a pending request.
    if (error.code === '23505') {
      return { error: tErr('pendingExchangeExists') }
    }
    return { error: error.message }
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/exchanges')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId,
    topic: 'exchange',
    sourceTable: 'exchange_requests',
    sourceId: data.id as string,
    title: tAdminNotify('exchangeTitle'),
    body: tAdminNotify('exchangeBody', {
      user: session.username,
      silver: silver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals?tab=exchange',
  })
  return { id: data.id }
}

export async function cancelMyExchangeRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
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
    .select('id, status, discord_id')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('exchange_requests')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('status', 'pending')
  if (deleteError) return { error: deleteError.message }

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
  const session = await getSession()
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
    .select('id, status, discord_id')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }

  // Re-check balance against current ledger — same guard requestExchange uses.
  const { spendable, error: balanceError } = await getMemberSpendablePointBalance(db, guildId, session.discordId)
  if (balanceError) return { error: balanceError }
  if (spendable < silver) {
    return { error: tErr('insufficientBalance', { balance: spendable.toLocaleString() }) }
  }

  const { error: updateError } = await db
    .from('exchange_requests')
    .update({ silver })
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('status', 'pending')
  if (updateError) return { error: updateError.message }

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
  const { data, error } = await db
    .from('exchange_requests')
    .select('id, silver, status, admin_notes, created_at, resolved_at, handled_by_username')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
  if (error) return { requests: [], error: error.message }
  const requests: MyExchangeRequest[] = (data ?? []).map((row) => ({
    id: row.id,
    silver: row.silver,
    status: row.status as MyExchangeRequest['status'],
    admin_notes: row.admin_notes,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    handled_by_username: row.handled_by_username ?? null,
  }))
  return { requests }
}
