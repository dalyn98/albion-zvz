import { getAdminClient } from '@/lib/supabase-admin'

export type AppSettingKey =
  | 'event_notification_message'
  | 'landing_banner_url'
  | 'landing_cta_text'

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
