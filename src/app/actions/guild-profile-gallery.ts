'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { GALLERY_MAX_ITEMS } from '@/lib/guild-profile-gallery'

const BUCKET = 'guild-profiles'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`
const CAPTION_MAX_LENGTH = 120

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

function revalidate() {
  revalidatePath('/admin/dashboard/guild-profile')
  revalidatePath('/public/g/[slug]', 'page')
}

export async function addGalleryItem(
  formData: FormData,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const file = formData.get('file')
    const captionRaw = (formData.get('caption') as string) ?? ''
    if (!(file instanceof File)) return { error: tErr('bannerNoFile') }
    if (file.size === 0) return { error: tErr('bannerEmptyFile') }
    if (file.size > MAX_FILE_SIZE) return { error: tErr('bannerFileTooLarge') }
    if (!ALLOWED_TYPES.includes(file.type)) return { error: tErr('bannerWrongType') }

    const caption = captionRaw.trim().slice(0, CAPTION_MAX_LENGTH)

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)

    // 한도 검사 — 행 단위 count 후에만 업로드 진행.
    const { count } = await db
      .from('guild_profile_gallery_items')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
    if ((count ?? 0) >= GALLERY_MAX_ITEMS) {
      return { error: tErr('galleryAtMax', { max: GALLERY_MAX_ITEMS }) }
    }

    const path = `${guildId}/gallery-${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      return { error: tErr('bannerUploadFailed', { reason: uploadError.message }) }
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl

    const nextPosition = count ?? 0
    const { error: insertError } = await db
      .from('guild_profile_gallery_items')
      .insert({
        guild_id: guildId,
        position: nextPosition,
        image_url: publicUrl,
        caption: caption.length > 0 ? caption : null,
      })
    if (insertError) {
      // 행 저장 실패 시 방금 올린 파일은 롤백.
      await db.storage.from(BUCKET).remove([path])
      return { error: insertError.message }
    }

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function removeGalleryItem(
  itemId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)

    // tenant scope 검증 — 다른 길드 행 삭제 차단.
    const { data: row } = await db
      .from('guild_profile_gallery_items')
      .select('id, image_url')
      .eq('id', itemId)
      .eq('guild_id', guildId)
      .maybeSingle()
    if (!row) return { error: tErr('serverError') }

    const { error: deleteError } = await db
      .from('guild_profile_gallery_items')
      .delete()
      .eq('id', itemId)
      .eq('guild_id', guildId)
    if (deleteError) return { error: deleteError.message }

    const path = extractPath((row.image_url as string) ?? '')
    if (path) await db.storage.from(BUCKET).remove([path])

    // 남은 행 position 재정렬 (구멍 메우기). 6장 이내라 한 번에 끌어올린다.
    const { data: remaining } = await db
      .from('guild_profile_gallery_items')
      .select('id')
      .eq('guild_id', guildId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (remaining) {
      await Promise.all(
        remaining.map((r, idx) =>
          db
            .from('guild_profile_gallery_items')
            .update({ position: idx })
            .eq('id', r.id),
        ),
      )
    }

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function moveGalleryItem(
  itemId: string,
  direction: 'up' | 'down',
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)

    const { data: rows } = await db
      .from('guild_profile_gallery_items')
      .select('id, position')
      .eq('guild_id', guildId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (!rows || rows.length === 0) return { error: tErr('serverError') }

    const idx = rows.findIndex((r) => r.id === itemId)
    if (idx === -1) return { error: tErr('serverError') }
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= rows.length) return {}

    const a = rows[idx]
    const b = rows[swapIdx]
    // 두 행의 position 을 swap. 같은 값으로 잠시 충돌해도 unique 가 없어 안전.
    const aPos = a.position as number
    const bPos = b.position as number
    await db
      .from('guild_profile_gallery_items')
      .update({ position: bPos })
      .eq('id', a.id)
    await db
      .from('guild_profile_gallery_items')
      .update({ position: aPos })
      .eq('id', b.id)

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateGalleryCaption(
  itemId: string,
  caption: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)

    const trimmed = caption.trim().slice(0, CAPTION_MAX_LENGTH)
    const { error } = await db
      .from('guild_profile_gallery_items')
      .update({ caption: trimmed.length > 0 ? trimmed : null })
      .eq('id', itemId)
      .eq('guild_id', guildId)
    if (error) return { error: error.message }

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
