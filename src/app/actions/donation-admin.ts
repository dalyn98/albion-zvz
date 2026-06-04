'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'
import { logAdminAction } from '@/lib/admin-audit'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'

const SCREENSHOT_BUCKET = 'donation-screenshots'
// 리기어와 동일 — 관리자가 검토 중 창을 띄워둘 시간만 주면 된다.
const SCREENSHOT_URL_TTL_SECONDS = 10 * 60

export interface AdminDonationRequest {
  id: string
  discord_id: string
  username: string
  silver: number
  memo: string | null
  screenshot_path: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
}

interface DonationRequestRow {
  id: string
  discord_id: string
  username: string
  silver: number
  memo: string | null
  screenshot_path: string | null
  status: string
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
}

export async function listDonationRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminDonationRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const page = await selectPagedRows<DonationRequestRow>({
      label: 'donation requests',
      buildQuery: () => {
        let query = db
          .from('donation_requests')
          .select(
            'id, discord_id, username, silver, memo, screenshot_path, status, admin_notes, created_at, resolved_at, handled_by, handled_by_username',
          )
          .eq('guild_id', guildId)
        if (scope === 'pending') query = query.eq('status', 'pending')
        return query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }) as unknown as SupabasePagedQuery<DonationRequestRow>
      },
    })
    if (page.error) return { requests: [], error: page.error }
    const requests: AdminDonationRequest[] = page.rows.map((row) => ({
      id: row.id,
      discord_id: row.discord_id,
      username: row.username,
      silver: row.silver,
      memo: row.memo,
      screenshot_path: row.screenshot_path,
      status: row.status as AdminDonationRequest['status'],
      admin_notes: row.admin_notes,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      handled_by: row.handled_by ?? null,
      handled_by_username: row.handled_by_username ?? null,
    }))
    return { requests }
  } catch (e) {
    return { requests: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getDonationScreenshotUrl(
  path: string,
): Promise<{ url?: string; error?: string }> {
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

export async function approveDonationRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('approve_donation_request', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('DONATION_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/donations')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    const { data: row } = await db
      .from('donation_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, guildId, {
        title: tDm('donationApprovedTitle'),
        body: tDm('donationApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'donation.approve',
      targetId: id,
      targetKind: 'donation',
      targetDiscordId: row?.discord_id ?? null,
      details: { silver: row?.silver ?? 0 },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function rejectDonationRequest(
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
    const { error } = await db.rpc('reject_donation_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('DONATION_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/donations')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    const { data: row } = await db
      .from('donation_requests')
      .select('discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, guildId, {
        title: tDm('donationRejectedTitle'),
        body: tDm('donationRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'donation.reject',
      targetId: id,
      targetKind: 'donation',
      targetDiscordId: row?.discord_id ?? null,
      details: { silver: row?.silver ?? 0, notes: notes.trim() || null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
