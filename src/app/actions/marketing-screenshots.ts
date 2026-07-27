'use server'


import { publicActionError } from '@/lib/public-action-error'
import { randomUUID } from 'crypto'
// Next.js 16 분리: revalidateTag(tag, profile) 는 일반 무효화, updateTag(tag)
// 는 server action 에서 read-your-own-writes 보장. 슈퍼어드민이 업로드 직후
// 자기 화면(super-admin/marketing-screenshots)에서 즉시 갱신을 봐야 하므로 후자.
import { revalidatePath, updateTag } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  MARKETING_SCREENSHOT_KEYS,
  MARKETING_SCREENSHOTS_TAG,
  type MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'
import { validateImageUploadFile } from '@/lib/image-upload'

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

function revalidate() {
  updateTag(MARKETING_SCREENSHOTS_TAG)
  revalidatePath('/super-admin/marketing-screenshots')
  revalidatePath('/', 'page')
  revalidatePath('/landing', 'page')
  revalidatePath('/public/landing', 'page')
  revalidatePath('/features', 'page')
  revalidatePath('/public/features', 'page')
}

function uploadErrorMessage(
  t: Awaited<ReturnType<typeof getTranslations>>,
  error: 'missing' | 'empty' | 'tooLarge' | 'wrongType',
): string {
  switch (error) {
    case 'missing':
      return t('carouselErrorMissingFile')
    case 'empty':
      return t('carouselErrorEmptyFile')
    case 'tooLarge':
      return t('carouselErrorFileTooLarge', { maxMb: MAX_FILE_SIZE / 1024 / 1024 })
    case 'wrongType':
      return t('carouselErrorUnsupportedType')
  }
}

export async function uploadMarketingScreenshot(
  formData: FormData,
): Promise<{ error?: string }> {
  const t = await getTranslations('publicMarketing')
  try {
    const session = await requireSuperAdmin()
    const slotRaw = formData.get('slot')
    const file = formData.get('file')
    const altRaw = (formData.get('alt') as string | null) ?? ''

    if (!isValidSlot(slotRaw)) return { error: t('carouselErrorInvalidSlot') }
    const image = await validateImageUploadFile(file, {
      allowedTypes: ALLOWED_TYPES,
      maxBytes: MAX_FILE_SIZE,
    })
    if (!image.ok) return { error: uploadErrorMessage(t, image.error) }

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

    const path = `${slot}/${randomUUID()}.${image.ext}`
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, image.file, { contentType: image.mime, upsert: false })
    if (uploadError) {
      return { error: await publicActionError(uploadError, 'actions/marketing-screenshots') }
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
      return { error: await publicActionError(insertError, 'actions/marketing-screenshots') }
    }

    revalidate()
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/marketing-screenshots') }
  }
}

export async function deleteMarketingScreenshot(
  id: string,
): Promise<{ error?: string }> {
  const t = await getTranslations('publicMarketing')
  try {
    await requireSuperAdmin()
    const db = getAdminClient()

    const { data: row } = await db
      .from('marketing_screenshots')
      .select('id, slot, image_url')
      .eq('id', id)
      .maybeSingle()
    if (!row) return { error: t('carouselErrorNotFound') }

    const { error: deleteError } = await db
      .from('marketing_screenshots')
      .delete()
      .eq('id', id)
    if (deleteError) return { error: await publicActionError(deleteError, 'actions/marketing-screenshots') }

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
    return { error: await publicActionError(e, 'actions/marketing-screenshots') }
  }
}

export async function moveMarketingScreenshot(
  id: string,
  direction: 'up' | 'down',
): Promise<{ error?: string }> {
  const t = await getTranslations('publicMarketing')
  try {
    await requireSuperAdmin()
    const db = getAdminClient()

    const { data: target } = await db
      .from('marketing_screenshots')
      .select('id, slot')
      .eq('id', id)
      .maybeSingle()
    if (!target) return { error: t('carouselErrorNotFound') }

    const { data: rows } = await db
      .from('marketing_screenshots')
      .select('id, position')
      .eq('slot', target.slot as string)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (!rows || rows.length === 0) return { error: t('carouselErrorNoReorderTargets') }

    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) return { error: t('carouselErrorTargetMissing') }
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
    return { error: await publicActionError(e, 'actions/marketing-screenshots') }
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
    if (error) return { error: await publicActionError(error, 'actions/marketing-screenshots') }
    revalidate()
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/marketing-screenshots') }
  }
}
