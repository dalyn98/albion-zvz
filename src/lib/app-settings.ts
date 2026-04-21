import { getAdminClient } from '@/lib/supabase-admin'

export type AppSettingKey =
  | 'event_notification_message'
  | 'landing_banner_url'
  | 'landing_cta_text'
  // Migration 025: admin-managed invite token. Empty string means guests are
  // disabled (no one can join via `?invite=...`). Admin rotates this value to
  // invalidate any outstanding invite links.
  | 'guest_invite_token'
  // Admin-authored notice shown at the top of `/regear`. Empty string = hide.
  | 'regear_notice_message'
  // Admin-authored notice shown at the top of `/` (events list). Empty = hide.
  | 'events_notice_message'
  // JSON array (string) of Discord role IDs whose holders gain the event
  // creator capability. Empty array = admin-only. Computed at login into
  // `SessionPayload.canCreateEvents` — changes require affected users to
  // re-login before taking effect.
  | 'event_creator_role_ids'
  // JSON array (string) of Discord role IDs. Holders are eligible to be
  // assigned as a bomb squad caller on a per-party basis. The flag is baked
  // into `guild_avatars.is_bomb_squad_caller` at login, so role changes take
  // effect after the member's next login.
  | 'bomb_squad_caller_role_ids'
  // Regear submission window in minutes, measured from `events.battle_started_at`.
  // Stored as an integer string. Killboard verification uses the same window.
  // Default '60' matches the legacy hard-coded value.
  | 'regear_window_minutes'
  // Max regear requests per user per event (non-rejected rows). Integer string.
  // Default '1' matches the legacy partial-unique constraint. Raising this lets
  // members submit one request per in-game death within the same event.
  | 'regear_max_deaths_per_event'
  // Boolean string ('true'/'false'). When 'true', the event-imminent cron also
  // auto-sets `battle_started_at = gather_at` for events whose gather_at has
  // passed — so the regear window opens at the scheduled time without waiting
  // for the admin to click the manual start button.
  | 'events_auto_start_enabled'
  // Integer string 1..100. Admin-configurable payout rate applied at approval
  // time: point_ledger delta = floor(claimed_silver × percent ÷ 100). Default
  // '100' keeps the legacy behaviour (pay the full claim).
  | 'regear_payout_rate_percent'

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
