'use server'

// 이벤트 생성 알림(Discord embed) 에 첨부할 이미지. landing-banner.ts 와 같은
// 패턴으로 단일 이미지 슬롯 1 개만 유지 — 새 이미지로 교체하거나 지울 수 있다.

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'

const BUCKET = 'notification-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`

function extractPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  return url.slice(idx + PUBLIC_URL_PREFIX.length)
}

async function readCurrentUrl(
  db: ReturnType<typeof getAdminClient>,
): Promise<string> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'event_notification_image_url')
    .maybeSingle()
  return data?.value ?? ''
}

async function writeUrl(
  db: ReturnType<typeof getAdminClient>,
  value: string,
): Promise<string | null> {
  const { error } = await db
    .from('app_settings')
    .upsert(
      { key: 'event_notification_image_url', value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
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

export async function uploadNotificationImage(
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
    const previousUrl = await readCurrentUrl(db)

    const path = `notify-${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const writeErr = await writeUrl(db, publicUrl)
    if (writeErr) {
      await db.storage.from(BUCKET).remove([path])
      return { error: writeErr }
    }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/settings')
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearNotificationImage(): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const previousUrl = await readCurrentUrl(db)

    const writeErr = await writeUrl(db, '')
    if (writeErr) return { error: writeErr }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
