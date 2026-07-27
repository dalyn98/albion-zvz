'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { validateImageUploadFile } from '@/lib/image-upload'
import { isPostgresPositiveInt } from '@/lib/postgres-int'
import { parsePositiveSafeInt } from '@/lib/parse-bounded-int'

// 길드 포인트 환전 신청 — 유저 측 액션. 관리자 측은 donation-admin.ts.
//
// 플로우: 유저가 인게임 길드 금고에 실버를 입금하고 해당 스크린샷을
// 첨부해 신청한다. 관리자 승인 시 신청 금액이 point_ledger 에
// +가산된다 (reason='donation_approved'). 이벤트나 역할과 무관하므로 언제든
// 제출할 수 있고, 한 유저가 여러 건을 동시에 가져가도 된다 (환전처럼 pending
// 단건 제한을 걸지 않는다 — 금고 입금은 별도 액션마다 찍히는 증빙이므로).

const SCREENSHOT_BUCKET = 'donation-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024 // 10 MiB — bucket 제한과 일치
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_MEMO_LENGTH = 500

function screenshotUploadErrorMessage(
  tErr: Awaited<ReturnType<typeof getTranslations>>,
  error: 'missing' | 'empty' | 'tooLarge' | 'wrongType',
): string {
  switch (error) {
    case 'missing':
    case 'empty':
      return tErr('screenshotMissing')
    case 'tooLarge':
      return tErr('screenshotTooLarge')
    case 'wrongType':
      return tErr('screenshotWrongType')
  }
}

export interface MyDonationRequest {
  id: string
  silver: number
  memo: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
}

export async function requestDonation(
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }

  const file = formData.get('screenshot')
  const silverRaw = String(formData.get('silver') ?? '')
  const memoRaw = String(formData.get('memo') ?? '').trim()
  const silver = parsePositiveSafeInt(silverRaw.replace(/,/g, ''))
  if (silver === null || !isPostgresPositiveInt(silver)) {
    return { error: tErr('donationInvalidAmount') }
  }
  if (memoRaw.length > MAX_MEMO_LENGTH) {
    return { error: tErr('donationMemoTooLong', { max: MAX_MEMO_LENGTH }) }
  }

  const guildId = await getSessionGuildId(session)
  const albionError = await requireAlbionVerified(session.discordId, guildId)
  if (albionError) return { error: albionError }

  const image = await validateImageUploadFile(file, {
    allowedTypes: ALLOWED_MIME,
    maxBytes: MAX_SCREENSHOT_BYTES,
  })
  if (!image.ok) return { error: screenshotUploadErrorMessage(tErr, image.error) }

  const db = getAdminClient()

  // 리기어와 동일한 전략: 스크린샷을 먼저 올리고 DB insert 가 실패하면
  // 파일만 삭제. orphan 레코드보다 orphan 파일이 추적/정리가 쉽다.
  const path = `${session.discordId}/${Date.now()}.${image.ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, image.file, { contentType: image.mime, upsert: false })
  if (uploadError) {
    return { error: await publicActionError(uploadError, 'actions/donation') }
  }

  const { data, error: insertError } = await db
    .from('donation_requests')
    .insert({
      guild_id: guildId,
      discord_id: session.discordId,
      username: session.username,
      silver,
      memo: memoRaw || null,
      screenshot_path: path,
    })
    .select('id')
    .single()
  if (insertError) {
    await db.storage.from(SCREENSHOT_BUCKET).remove([path])
    return { error: await publicActionError(insertError, 'actions/donation') }
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/donations')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId,
    topic: 'donation',
    sourceTable: 'donation_requests',
    sourceId: data.id as string,
    title: tAdminNotify('donationTitle'),
    body: tAdminNotify('donationBody', {
      user: session.username,
      silver: silver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals?tab=donation',
  })
  return { id: data.id }
}

export async function cancelMyDonationRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('donation_requests')
    .select('id, status, discord_id, screenshot_path')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: await publicActionError(fetchError, 'actions/donation') }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { data: deletedRows, error: deleteError } = await db
    .from('donation_requests')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (deleteError) return { error: await publicActionError(deleteError, 'actions/donation') }
  if (!deletedRows || deletedRows.length === 0) {
    return { error: tErr('alreadyProcessedCannotCancel') }
  }

  if (row.screenshot_path) {
    await db.storage.from(SCREENSHOT_BUCKET).remove([row.screenshot_path])
  }

  revalidatePath('/me')
  revalidatePath('/admin/dashboard/donations')
  revalidatePath('/', 'layout')
  return {}
}

export async function listMyDonationRequests(): Promise<{
  requests: MyDonationRequest[]
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
    .from('donation_requests')
    .select('id, silver, memo, status, admin_notes, created_at, resolved_at, handled_by_username')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
  if (error) return { requests: [], error: await publicActionError(error, 'actions/donation') }
  const requests: MyDonationRequest[] = (data ?? []).map((row) => ({
    id: row.id,
    silver: row.silver,
    memo: row.memo,
    status: row.status as MyDonationRequest['status'],
    admin_notes: row.admin_notes,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    handled_by_username: row.handled_by_username ?? null,
  }))
  return { requests }
}
