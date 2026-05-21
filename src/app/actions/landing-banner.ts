'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'

const BANNER_BUCKET = 'landing-banners'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BANNER_BUCKET}/`
const LANDING_BANNER_CAPS = [CAP.SETTINGS_GUILD_PROFILE] as const

// 기존 배너가 있으면 URL에서 파일 경로를 역추출해 함께 지운다. 실패해도 치명적이지
// 않으므로(스토리지에 고아 파일이 쌓일 뿐) 조용히 스킵.
function extractPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  return url.slice(idx + PUBLIC_URL_PREFIX.length)
}

async function readCurrentBannerUrl(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
): Promise<string> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', 'landing_banner_url')
    .maybeSingle()
  return data?.value ?? ''
}

async function writeBannerUrl(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  value: string,
): Promise<string | null> {
  const { error } = await db
    .from('app_settings')
    .upsert(
      { guild_id: guildId, key: 'landing_banner_url', value, updated_at: new Date().toISOString() },
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

export async function uploadLandingBanner(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const file = formData.get('file')
    if (!(file instanceof File)) return { error: tErr('bannerNoFile') }
    if (file.size === 0) return { error: tErr('bannerEmptyFile') }
    if (file.size > MAX_FILE_SIZE) {
      return { error: tErr('bannerFileTooLarge') }
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { error: tErr('bannerWrongType') }
    }

    const db = await requireAnyCapability(LANDING_BANNER_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const previousUrl = await readCurrentBannerUrl(db, guildId)

    const path = `banner-${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BANNER_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }

    const { data: urlData } = db.storage.from(BANNER_BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const writeErr = await writeBannerUrl(db, guildId, publicUrl)
    if (writeErr) {
      // 설정 저장이 실패했으면 방금 올린 파일도 롤백. 고아 파일 방지.
      await db.storage.from(BANNER_BUCKET).remove([path])
      return { error: writeErr }
    }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BANNER_BUCKET).remove([previousPath])
    }

    revalidatePath('/')
    revalidatePath('/admin/dashboard/settings')
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearLandingBanner(): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(LANDING_BANNER_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const previousUrl = await readCurrentBannerUrl(db, guildId)

    const writeErr = await writeBannerUrl(db, guildId, '')
    if (writeErr) return { error: writeErr }

    const previousPath = previousUrl ? extractPath(previousUrl) : null
    if (previousPath) {
      await db.storage.from(BANNER_BUCKET).remove([previousPath])
    }

    revalidatePath('/')
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
