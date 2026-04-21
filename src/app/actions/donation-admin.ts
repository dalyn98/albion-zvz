'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'

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
}

export async function listDonationRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminDonationRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    let query = db
      .from('donation_requests')
      .select(
        'id, discord_id, username, silver, memo, screenshot_path, status, admin_notes, created_at, resolved_at',
      )
      .order('created_at', { ascending: false })
    if (scope === 'pending') query = query.eq('status', 'pending')
    const { data, error } = await query
    if (error) return { requests: [], error: error.message }
    return { requests: (data ?? []) as AdminDonationRequest[] }
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
    const { error } = await db.rpc('approve_donation_request', { p_id: id })
    if (error) {
      if (error.message.includes('DONATION_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/donations')
    revalidatePath('/me')
    const { data: row } = await db
      .from('donation_requests')
      .select('discord_id, silver')
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('donationApprovedTitle'),
        body: tDm('donationApprovedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
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
    const { error } = await db.rpc('reject_donation_request', {
      p_id: id,
      p_notes: notes.trim() || null,
    })
    if (error) {
      if (error.message.includes('DONATION_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/donations')
    revalidatePath('/me')
    const { data: row } = await db
      .from('donation_requests')
      .select('discord_id, silver')
      .eq('id', id)
      .maybeSingle()
    if (row?.discord_id) {
      void sendDiscordDmToUser(row.discord_id, {
        title: tDm('donationRejectedTitle'),
        body: tDm('donationRejectedBody', { silver: formatSilver(row.silver ?? 0) }),
        url: '/me',
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
