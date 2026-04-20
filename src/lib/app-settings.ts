import { getAdminClient } from '@/lib/supabase-admin'

export type AppSettingKey =
  | 'event_notification_message'
  | 'landing_banner_url'
  | 'landing_cta_text'
  // Migration 024: date range applied to `/members` aggregate stats. Either
  // value may be empty string, meaning "no bound on that side" (all-time).
  // Stored as 'YYYY-MM-DD' — parsed client-side as a local date.
  | 'members_aggregate_start_date'
  | 'members_aggregate_end_date'
  // Migration 025: admin-managed invite token. Empty string means guests are
  // disabled (no one can join via `?invite=...`). Admin rotates this value to
  // invalidate any outstanding invite links.
  | 'guest_invite_token'

// 빈 문자열은 "아직 미설정" 의미로 쓰인다(예: landing_banner_url). 호출부에서
// 빈 값을 허용할지 fallback을 돌려줄지 결정.
export async function getAppSetting(key: AppSettingKey, fallback: string): Promise<string> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return fallback
  return data.value
}
