'use server'

// 페이지 상단 공지(DismissibleNoticeBanner) 이미지. 홈(/) 과 리기어(/regear)
// 각각 단일 이미지 슬롯 1 개를 유지한다. landing-banner.ts 패턴과 동일.

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import type { AppSettingKey } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'

export type NoticeTarget = 'events' | 'regear'

const BUCKET = 'notice-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`

function settingKeyFor(target: NoticeTarget): AppSettingKey {
  return target === 'events' ? 'events_notice_image_url' : 'regear_notice_image_url'
}

function extractPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  return url.slice(idx + PUBLIC_URL_PREFIX.length)
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

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'bin'
  }
}

export async function uploadNoticeImage(
  target: NoticeTarget,
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const file = formData.get('file')
    if (!(file instanceof File)) return { error: tErr('bannerNoFile') }
    if (file.size === 0) return { error: tErr('bannerEmptyFile') }
    if (file.size > MAX_FILE_SIZE) return { error: tErr('bannerFileTooLarge') }
    if (!ALLOWED_TYPES.includes(file.type)) return { error: tErr('bannerWrongType') }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const key = settingKeyFor(target)
    const previousUrl = await readCurrentUrl(db, guildId, key)

    const path = `${target}/${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const writeErr = await writeUrl(db, guildId, key, publicUrl)
    if (writeErr) {
      await db.storage.from(BUCKET).remove([path])
      return { error: writeErr }
    }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/settings')
    if (target === 'events') revalidatePath('/')
    else revalidatePath('/regear')
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearNoticeImage(
  target: NoticeTarget,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const key = settingKeyFor(target)
    const previousUrl = await readCurrentUrl(db, guildId, key)

    const writeErr = await writeUrl(db, guildId, key, '')
    if (writeErr) return { error: writeErr }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/settings')
    if (target === 'events') revalidatePath('/')
    else revalidatePath('/regear')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
