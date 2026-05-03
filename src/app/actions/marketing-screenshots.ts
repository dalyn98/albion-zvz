'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/super-admin'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  MARKETING_SCREENSHOT_KEYS,
  type MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'

const BUCKET = 'marketing-screenshots'
const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`
const ALT_MAX_LENGTH = 120

function isValidSlot(value: unknown): value is MarketingScreenshotKey {
  return (
    typeof value === 'string' &&
    (MARKETING_SCREENSHOT_KEYS as readonly string[]).includes(value)
  )
}

function extractPath(url: string): string | null {
  const idx = url.indexOf(PUBLIC_URL_PREFIX)
  if (idx === -1) return null
  return url.slice(idx + PUBLIC_URL_PREFIX.length)
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

function revalidate() {
  revalidatePath('/super-admin/marketing-screenshots')
  revalidatePath('/public/landing', 'page')
  revalidatePath('/public/features', 'page')
}

export async function uploadMarketingScreenshot(
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin()
    const slotRaw = formData.get('slot')
    const file = formData.get('file')
    const altRaw = (formData.get('alt') as string | null) ?? ''

    if (!isValidSlot(slotRaw)) return { error: '슬롯이 올바르지 않습니다.' }
    if (!(file instanceof File)) return { error: '파일이 없습니다.' }
    if (file.size === 0) return { error: '빈 파일입니다.' }
    if (file.size > MAX_FILE_SIZE) {
      return { error: `파일이 너무 큽니다 (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB).` }
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { error: 'PNG / JPG / WEBP 만 허용됩니다.' }
    }

    const slot = slotRaw
    const alt = altRaw.trim().slice(0, ALT_MAX_LENGTH)
    const db = getAdminClient()

    // 다음 position 계산 (현재 슬롯의 max+1).
    const { data: maxRow } = await db
      .from('marketing_screenshots')
      .select('position')
      .eq('slot', slot)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1

    const path = `${slot}/${randomUUID()}.${extFromMime(file.type)}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      return { error: `업로드 실패: ${uploadError.message}` }
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)

    const { error: insertError } = await db.from('marketing_screenshots').insert({
      slot,
      position: nextPosition,
      image_url: urlData.publicUrl,
      alt_text: alt.length > 0 ? alt : null,
      uploaded_by_discord_id: session.discordId,
    })
    if (insertError) {
      // 행 저장 실패 시 방금 올린 파일 롤백.
      await db.storage.from(BUCKET).remove([path])
      return { error: insertError.message }
    }

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'serverError' }
  }
}

export async function deleteMarketingScreenshot(
  id: string,
): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin()
    const db = getAdminClient()

    const { data: row } = await db
      .from('marketing_screenshots')
      .select('id, slot, image_url')
      .eq('id', id)
      .maybeSingle()
    if (!row) return { error: '존재하지 않는 항목입니다.' }

    const { error: deleteError } = await db
      .from('marketing_screenshots')
      .delete()
      .eq('id', id)
    if (deleteError) return { error: deleteError.message }

    const path = extractPath((row.image_url as string) ?? '')
    if (path) await db.storage.from(BUCKET).remove([path])

    // 같은 슬롯의 남은 행 position 재정렬 (구멍 메우기).
    const { data: remaining } = await db
      .from('marketing_screenshots')
      .select('id')
      .eq('slot', row.slot as string)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (remaining) {
      await Promise.all(
        remaining.map((r, idx) =>
          db
            .from('marketing_screenshots')
            .update({ position: idx })
            .eq('id', r.id as string),
        ),
      )
    }

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'serverError' }
  }
}

export async function moveMarketingScreenshot(
  id: string,
  direction: 'up' | 'down',
): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin()
    const db = getAdminClient()

    const { data: target } = await db
      .from('marketing_screenshots')
      .select('id, slot')
      .eq('id', id)
      .maybeSingle()
    if (!target) return { error: '존재하지 않는 항목입니다.' }

    const { data: rows } = await db
      .from('marketing_screenshots')
      .select('id, position')
      .eq('slot', target.slot as string)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (!rows || rows.length === 0) return { error: '재정렬 대상이 없습니다.' }

    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) return { error: '대상을 찾지 못했습니다.' }
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= rows.length) return {}

    const a = rows[idx]
    const b = rows[swapIdx]
    const aPos = a.position as number
    const bPos = b.position as number
    await db
      .from('marketing_screenshots')
      .update({ position: bPos })
      .eq('id', a.id as string)
    await db
      .from('marketing_screenshots')
      .update({ position: aPos })
      .eq('id', b.id as string)

    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'serverError' }
  }
}

export async function updateMarketingScreenshotAlt(
  id: string,
  alt: string,
): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin()
    const db = getAdminClient()
    const trimmed = alt.trim().slice(0, ALT_MAX_LENGTH)
    const { error } = await db
      .from('marketing_screenshots')
      .update({ alt_text: trimmed.length > 0 ? trimmed : null })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidate()
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'serverError' }
  }
}
