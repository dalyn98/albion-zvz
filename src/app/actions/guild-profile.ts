'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'

const BUCKET = 'guild-profiles'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`

// 기존 배너 / 로고가 있으면 URL 에서 파일 경로를 역추출해 함께 지운다. 실패해도
// 치명적이지 않아 (스토리지에 고아 파일이 쌓일 뿐) 조용히 스킵.
function extractPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  return url.slice(idx + PUBLIC_URL_PREFIX.length)
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

async function readSettingValue(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  key: 'guild_profile_banner_url',
): Promise<string> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? ''
}

async function writeSettingValue(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  key: 'guild_profile_banner_url',
  value: string,
): Promise<string | null> {
  const { error } = await db.from('app_settings').upsert(
    { guild_id: guildId, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'guild_id,key' },
  )
  return error?.message ?? null
}

export async function uploadGuildProfileBanner(
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
    const previousUrl = await readSettingValue(db, guildId, 'guild_profile_banner_url')

    const path = `${guildId}/banner-${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const writeErr = await writeSettingValue(db, guildId, 'guild_profile_banner_url', publicUrl)
    if (writeErr) {
      // 설정 저장이 실패했으면 방금 올린 파일도 롤백. 고아 파일 방지.
      await db.storage.from(BUCKET).remove([path])
      return { error: writeErr }
    }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/guild-profile')
    revalidatePath('/public/g/[slug]', 'page')
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearGuildProfileBanner(): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const previousUrl = await readSettingValue(db, guildId, 'guild_profile_banner_url')

    const writeErr = await writeSettingValue(db, guildId, 'guild_profile_banner_url', '')
    if (writeErr) return { error: writeErr }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BUCKET).remove([previousPath])
    }

    revalidatePath('/admin/dashboard/guild-profile')
    revalidatePath('/public/g/[slug]', 'page')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
