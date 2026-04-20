'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import type { AppSettingKey } from '@/lib/app-settings'

const EDITABLE_KEYS: readonly AppSettingKey[] = [
  'event_notification_message',
  'landing_cta_text',
  'members_aggregate_start_date',
  'members_aggregate_end_date',
  'guest_invite_token',
  'regear_notice_message',
  'events_notice_message',
] as const

const MAX_VALUE_LENGTH = 500

// Keys for which an empty value is meaningful (= "unset, fall back to
// application default"). Other keys reject empty input.
const ALLOW_EMPTY_KEYS: readonly AppSettingKey[] = [
  'landing_cta_text',
  'members_aggregate_start_date',
  'members_aggregate_end_date',
  // Empty token = guest invites disabled. Admin rotates or clears to revoke.
  'guest_invite_token',
  // Empty message = hide the regear notice banner entirely.
  'regear_notice_message',
  'events_notice_message',
] as const

// Date-shaped setting keys that must be 'YYYY-MM-DD' or empty. A free-form
// setting form could drop arbitrary strings here, so we validate explicitly.
const DATE_KEYS: readonly AppSettingKey[] = [
  'members_aggregate_start_date',
  'members_aggregate_end_date',
] as const

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function updateAppSetting(
  key: AppSettingKey,
  value: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!EDITABLE_KEYS.includes(key)) {
      return { error: tErr('unknownSettingKey') }
    }
    const trimmed = value.trim()
    if (!trimmed && !ALLOW_EMPTY_KEYS.includes(key)) {
      return { error: tErr('emptyValue') }
    }
    if (trimmed.length > MAX_VALUE_LENGTH) {
      return { error: tErr('valueTooLong', { max: MAX_VALUE_LENGTH }) }
    }
    if (trimmed && DATE_KEYS.includes(key) && !DATE_RE.test(trimmed)) {
      return { error: tErr('invalidDateFormat') }
    }
    const db = await requireAdmin()
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
