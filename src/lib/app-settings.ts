import { getAdminClient } from '@/lib/supabase-admin'

export type AppSettingKey =
  | 'event_notification_message'
  | 'events_notice_image_url'
  | 'regear_notice_image_url'
  | 'landing_banner_url'
  | 'landing_cta_text'
  // Admin-authored notice shown at the top of `/regear`. Empty string = hide.
  | 'regear_notice_message'
  // Admin-authored notice shown at the top of `/` (events list). Empty = hide.
  | 'events_notice_message'
  // JSON array (string) of Discord role IDs whose holders gain the event
  // creator capability. Empty array = admin-only. Computed at login into
  // `SessionPayload.canCreateEvents` — changes require affected users to
  // re-login before taking effect.
  | 'event_creator_role_ids'
  // Per-category event creator role IDs (전투/FF/갱킹). 각 키는 JSON array
  // (string) of Discord role IDs. 비어 있으면 같은 카테고리에 대해 admin 전용.
  // legacy `event_creator_role_ids` 가 채워져 있으면 그 값이 모든 카테고리에
  // 대해 추가로 부여 — backward-compat 을 위한 fallback. 세션에 카테고리 단위
  // 화이트리스트(`SessionPayload.eventCreatorCategories`) 로 baked-in.
  | 'event_creator_role_ids_combat'
  | 'event_creator_role_ids_ff'
  | 'event_creator_role_ids_ganking'
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
  // 길드 상점 할인율. 실수 문자열, 범위 (0, 1], 기본 '1'(할인 없음).
  // 포인트와 실버는 1:1 동일 개념 — 수동 가격/자동 가격(AODP 실버 시세) 모두
  // 실버 단위이고 이 할인율을 곱해 /shop 에 노출할 최종 포인트를 계산한다.
  // 예: 실버 1,000,000 × 0.5 = 500,000p.
  | 'shop_discount_rate'
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
  // 알비온 온보딩에서 "우리 길드" 로 인정할 Gameinfo GuildId (UUID 문자열).
  // 비어 있으면 인증 불가능(모든 유저가 [미인증] 저장). 관리자가 인게임 길드
  // 페이지의 URL 에서 복사해 넣는다. SaaS 확장 시 tenants 테이블로 이전.
  | 'albion_home_guild_id'
  // 위 GuildId 에 대응하는 표시명 (Gameinfo Name 그대로). killboard-sync 의
  // 동명이인 매칭 + verifyDeathInWindow 의 길드 일치 검증에 사용.
  // 비어 있으면 자동 검증/sync 가 skip — 환경변수 ALBION_GUILD_NAME 대체.
  | 'albion_home_guild_name'
  // Boolean 문자열. 'true' 이면 알비온 인증을 하지 않은 길드원도 사이트 전역에
  // 접근 가능 (현재 기본 동작). 'false' 이면 `layout.tsx` 게이트가 미인증 멤버
  // 를 `/onboarding/albion` 으로 강제 리디렉트. 관리자/게스트/공개 경로/OAuth
  // 콜백은 항상 제외.
  | 'allow_unverified_member_access'
  // Boolean 문자열. 'true' 이면 수동 리기어 신청 시 알비온 닉네임 인증을 요구.
  // 미인증 멤버에겐 /onboarding/albion 으로 안내하는 CTA 를 포함한 에러가 반환.
  // 기본 'true' (migration 070 이전의 항상-ON 동작 유지). 'false' 면 게이트 해제.
  | 'regear_require_verification'
  // 정수 문자열. 배틀 시작(`events.battle_started_at`) 이후 몇 분 뒤에 자동
  // 리기어 크론이 해당 이벤트를 처리할지. regear_window_minutes(수동 신청 오픈
  // 시점) 와 분리돼 있어 자동이 먼저 "pending" 행을 선점할 수 있게 한다.
  // 기본 '15'. killboard sync 지연 체크에도 이 값을 사용.
  | 'auto_regear_delay_minutes'
  // 길드 운영 시간대 (IANA timezone string). 알비온 4개 서버 프리셋 중 하나
  // ('Asia/Seoul'|'Europe/Berlin'|'America/New_York'|'America/Sao_Paulo') 만
  // 허용 — 검증은 lib/timezone.ts isValidTenantTimezone. 미설정/손상값은
  // 'Asia/Seoul' 로 fallback (기존 멘헤라 동작 유지).
  // 영향 범위: 이벤트 집결시간 표시, 리더보드/streak/재정 stats 의 일자 경계,
  // Discord 공지 본문의 시각 라벨.
  | 'tenant_timezone'
  // 정수 문자열 (5..1440). 이벤트 집결 시각으로부터 몇 분 전에 임박 DM 을 보낼지
  // 정하는 길드 기본값. 개인이 guild_avatars/guests.dm_lead_minutes 로 override
  // 하지 않은 경우 이 값을 사용. 기본 '35' = 기존 하드코딩 동작 유지.
  | 'event_dm_lead_minutes'

// 빈 문자열은 "아직 미설정" 의미로 쓰인다(예: landing_banner_url). 호출부에서
// 빈 값을 허용할지 fallback을 돌려줄지 결정.
//
// guildId 는 필수 — multi-tenant 환경에서 묵시적 primary-tenant fallback 은
// cross-tenant 누설 위험이 있다. 모든 호출자는 명시적으로 현재 tenant 의
// guildId 를 넘겨야 한다 (세션 → getSessionGuildId, 비로그인 공개 페이지 →
// getPrimaryTenantId 명시 호출, cron → 루프 중 tenant.id).
export async function getAppSetting(
  key: AppSettingKey,
  fallback: string,
  guildId: string,
): Promise<string> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('guild_id', guildId)
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return fallback
  return data.value
}
