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
  // 1 포인트 = N 실버. 상점 아이템의 자동 가격(AODP 실버 시세)을 포인트로
  // 환산할 때 사용. 정수 문자열, 기본 '1'.
  | 'shop_silver_to_point_rate'
  // /shop 상단에 뜨는 관리자 공지 — 아이템 전달 방법 등을 자유롭게 안내.
  // 빈 문자열이면 배너 비표시.
  | 'shop_delivery_notice'
  // 킬보드 API 가 붙을 알비온 서버. 'west' | 'east' | 'europe'.
  // 잘못 설정되면 /search 와 /deaths 모두 빈 응답이 돌아와 리기어 자동 검증이
  // 항상 실패한다. 기본 'east' — 레거시 하드코딩값(gameinfo-sgp) 유지.
  | 'albion_server'
  // 마지막 killboard-sync cron 성공 시각(ISO). 평시엔 1시간 쿨다운으로 API
  // 부하를 낮추고, 이벤트 진행 중엔 이 값을 무시하고 매 tick sync.
  | 'last_killboard_sync_at'
  // AODP 시세 조회에 쓸 도시 목록 (JSON array 문자열). 관리자가 체크박스로
  // 고르며, 비어 있으면 서버 측 DEFAULT_CITIES 로 fallback. Black Market 은
  // 매수 호가가 많아 sell_price_min 이 왜곡되므로 후보에서 제외.
  | 'aodp_cities'
  // 시세 조회 방식. 'spot' = /stats/prices 최저가, 'avg_Nd' = /stats/history
  // 최근 N 일 평균(아이템 수량 가중). 리기어 산정 변동성을 줄이고 싶으면
  // 평균 모드를 쓴다. 기본 'spot'.
  | 'aodp_price_mode'
  // 시세 조회 시 최소 품질 floor (1..5). 실제 아이템 품질이 이 값보다 낮으면
  // 이 값으로 끌어올려 조회 → "Normal 드랍도 Good 가치로 보정" 같은 정책
  // 구현. 기본 '1' (모든 품질 그대로).
  | 'aodp_min_quality'
  // Phase 3 자동 리기어 전역 스위치. 'true' 면 이벤트 종료 후 cron 이 killboard
  // victim 이벤트 → AODP 시세 → 즉시 승인. 빌드별 opt-out 체크박스(slots.
  // auto_regear_excluded) 도 이 toggle 이 켜져 있을 때만 UI 에 노출.
  | 'auto_regear_enabled'
  // 마지막 auto-regear cron 성공 시각(ISO). killboard-sync 와 유사한 throttle
  // 용이지만 auto-regear 는 "event 별로 1회" idempotent 가 더 강한 gate 라
  // 이 값은 모니터링/디버깅 용도에 가깝다.
  | 'last_auto_regear_at'
  // CD 뱃지를 노출할 역할군 목록 (JSON array 문자열, SlotRole 값). 빈 배열 =
  // 아무 슬롯에도 뱃지 표시 안 함. 기본 `["Dps"]`. 리더/탱커 등 다른 포지션
  // 까지 CD 를 보고 싶으면 관리자가 설정 페이지에서 추가.
  | 'cd_badge_roles'
  // JSON array (string) of Discord role IDs. "이 역할을 하나라도 보유하지 않는
  // 길드원 = 탈퇴자" 로 간주. 빈 배열이면 "디스코드 서버 재적 여부" 만 확인
  // (역할 검사 생략). member-sync cron 이 이 값을 읽어 withdrawn_at 플래그를
  // 갱신한다.
  | 'active_member_role_ids'
  // 마지막 member-sync cron 성공 시각(ISO). 하루 1회 이상 실행되지 않도록 gate
  // 용. 관리자에겐 /admin/dashboard/stats 의 탈퇴자 섹션에 마지막 동기화 시각
  // 으로 표시.
  | 'last_member_sync_at'

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
