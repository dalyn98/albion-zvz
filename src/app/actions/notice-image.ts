'use server'

// 페이지 상단 공지(DismissibleNoticeBanner) 이미지. 홈(/), 리기어(/regear),
// 길드 상점(/shop) 각각 단일 이미지 슬롯 1 개를 유지한다.

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAnyCapability } from '@/lib/auth'
import type { AppSettingKey } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { validateImageUploadFile } from '@/lib/image-upload'
import { revalidatePublicShopCache } from '@/lib/shop/cache'

export type NoticeTarget = 'events' | 'regear' | 'shop'

const BUCKET = 'notice-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`
const NOTICE_IMAGE_CAPS = [CAP.SETTINGS_GENERAL] as const
const SHOP_NOTICE_IMAGE_CAPS = [CAP.SHOP_PRICING] as const

function settingKeyFor(target: NoticeTarget): AppSettingKey {
  if (target === 'events') return 'events_notice_image_url'
  if (target === 'regear') return 'regear_notice_image_url'
  return 'shop_delivery_notice_image_url'
}

function normalizeNoticeTarget(target: unknown): NoticeTarget | null {
  return target === 'events' || target === 'regear' || target === 'shop'
    ? target
    : null
}

function noticeImageCaps(target: NoticeTarget): readonly bigint[] {
  return target === 'shop' ? SHOP_NOTICE_IMAGE_CAPS : NOTICE_IMAGE_CAPS
}

function revalidateNoticeTarget(target: NoticeTarget, guildId: string): void {
  revalidatePath('/admin/dashboard/settings')
  if (target === 'events') {
    revalidatePath('/')
    return
  }
  if (target === 'regear') {
    revalidatePath('/regear')
    return
  }
  revalidatePath('/admin/dashboard/shop')
  revalidatePublicShopCache(guildId)
  revalidatePath('/shop')
}

function extractPath(url: string, guildId: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  const path = url.slice(idx + PUBLIC_URL_PREFIX.length)
  return path.startsWith(`${guildId}/`) ? path : null
}

async function readCurrentUrl(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  key: AppSettingKey,
): Promise<string> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? ''
}

async function writeUrl(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  key: AppSettingKey,
  value: string,
): Promise<string | null> {
  const { error } = await db
    .from('app_settings')
    .upsert(
      { guild_id: guildId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'guild_id,key' },
    )
  return error?.message ?? null
}

function bannerUploadErrorMessage(
  tErr: Awaited<ReturnType<typeof getTranslations>>,
  error: 'missing' | 'empty' | 'tooLarge' | 'wrongType',
): string {
  switch (error) {
    case 'missing':
      return tErr('bannerNoFile')
    case 'empty':
      return tErr('bannerEmptyFile')
    case 'tooLarge':
      return tErr('bannerFileTooLarge')
    case 'wrongType':
      return tErr('bannerWrongType')
  }
}

export async function uploadNoticeImage(
  target: unknown,
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const noticeTarget = normalizeNoticeTarget(target)
    if (!noticeTarget) return { error: tErr('invalidInput') }

    const file = formData.get('file')
    const image = await validateImageUploadFile(file, {
      allowedTypes: ALLOWED_TYPES,
      maxBytes: MAX_FILE_SIZE,
    })
    if (!image.ok) return { error: bannerUploadErrorMessage(tErr, image.error) }

    const db = await requireAnyCapability(noticeImageCaps(noticeTarget))
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const key = settingKeyFor(noticeTarget)
    const previousUrl = await readCurrentUrl(db, guildId, key)

    const path = `${guildId}/${noticeTarget}-${randomUUID()}.${image.ext}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, image.file, { contentType: image.mime, upsert: false })
    if (uploadError) return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const writeErr = await writeUrl(db, guildId, key, publicUrl)
    if (writeErr) {
      await db.storage.from(BUCKET).remove([path])
      return { error: writeErr }
    }

    const previousPath = previousUrl ? extractPath(previousUrl, guildId) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidateNoticeTarget(noticeTarget, guildId)
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearNoticeImage(
  target: unknown,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const noticeTarget = normalizeNoticeTarget(target)
    if (!noticeTarget) return { error: tErr('invalidInput') }

    const db = await requireAnyCapability(noticeImageCaps(noticeTarget))
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const key = settingKeyFor(noticeTarget)
    const previousUrl = await readCurrentUrl(db, guildId, key)

    const writeErr = await writeUrl(db, guildId, key, '')
    if (writeErr) return { error: writeErr }

    const previousPath = previousUrl ? extractPath(previousUrl, guildId) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidateNoticeTarget(noticeTarget, guildId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
