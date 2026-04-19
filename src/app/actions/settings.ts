'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import type { AppSettingKey } from '@/lib/app-settings'

const EDITABLE_KEYS: readonly AppSettingKey[] = [
  'event_notification_message',
  'landing_cta_text',
] as const

const MAX_VALUE_LENGTH = 500

// Keys for which an empty value is meaningful (= "unset, fall back to
// application default"). Other keys reject empty input.
const ALLOW_EMPTY_KEYS: readonly AppSettingKey[] = ['landing_cta_text'] as const

async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}

export async function updateAppSetting(
  key: AppSettingKey,
  value: string,
): Promise<{ error?: string }> {
  try {
    if (!EDITABLE_KEYS.includes(key)) {
      return { error: '알 수 없는 설정 키입니다.' }
    }
    const trimmed = value.trim()
    if (!trimmed && !ALLOW_EMPTY_KEYS.includes(key)) {
      return { error: '값이 비어 있습니다.' }
    }
    if (trimmed.length > MAX_VALUE_LENGTH) {
      return { error: `값은 ${MAX_VALUE_LENGTH}자를 넘을 수 없습니다.` }
    }
    const db = await requireAdmin()
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}
