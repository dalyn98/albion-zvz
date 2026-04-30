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
  // 신청 가능한 리기어가 적격 리스트에 머무는 기간(일). 정수 문자열 1..90.
  // 이 시간이 지난 이벤트와 트래킹 사망은 /regear 의 "신청 가능" 섹션에서
  // 사라진다 (행 자체는 지우지 않음 — 통계·이력 보존). 기본 '14'.
  | 'regear_eligibility_days'
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
  // 마지막 battle-tracker cron 성공 시각(ISO). 자동 리기어가 tracked battle 매칭
  // (`auto-regear-matching.ts`) 을 사용하므로, battle-tracker 가 이벤트 종료 후
  // 한 번도 안 돌았으면 tenant_battle_records 가 비어 있어 stage 1 매칭이 항상 0.
  // → 그 케이스를 mark-processed 가 아닌 defer 로 처리하기 위한 가드값.
  | 'last_battle_tracker_sync_at'
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
  // 홈 길드의 현재 얼라이언스 ID (UUID 문자열). battle-tracker cron 이 매 run
  // 마다 홈 길드가 등장한 raw_battle 에서 자동 감지해 갱신한다. 빈 값 = "솔로
  // 길드 또는 아직 한 번도 검출 못함". 이 값이 있으면 홈 길드가 0명인 전투에서도
  // 같은 얼라이언스의 다른 길드만 참여한 케이스를 우리 측 전투로 집계한다
  // (alliance-level battle tracking). 어드민이 직접 만질 필요 없음 — cron 이
  // 자동 동기화. 알라이언스 가입/탈퇴/이전 후 1 cron 주기 안에 반영.
  | 'albion_home_alliance_id'
  // Boolean 문자열. 'true' 이면 알비온 인증을 하지 않은 길드원도 사이트 전역에
  // 접근 가능 (현재 기본 동작). 'false' 이면 `layout.tsx` 게이트가 미인증 멤버
  // 를 `/onboarding/albion` 으로 강제 리디렉트. 관리자/게스트/공개 경로/OAuth
  // 콜백은 항상 제외.
  | 'allow_unverified_member_access'
  // Boolean 문자열. 'true' 이면 수동 리기어 신청 시 알비온 닉네임 인증을 요구.
  // 미인증 멤버에겐 /onboarding/albion 으로 안내하는 CTA 를 포함한 에러가 반환.
  // 기본 'true' (migration 070 이전의 항상-ON 동작 유지). 'false' 면 게이트 해제.
  | 'regear_require_verification'
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
  // Boolean 문자열. 길드 단위 리기어 지급 모드 — 'true' 면 모든 신규 요청이
  // 'crafted' (제작자가 회차 박스로 전달), 'false' 면 'silver' (포인트 지급).
  // 멤버는 모드를 선택할 수 없고 길드 설정이 강제. 기본 'false'. /craft/queue 탭
  // 노출 여부도 이 값에 묶여 있어, 'false' 면 제작자/관리자에게도 탭이 숨겨진다.
  | 'craft_regear_enabled'
  // 정수 문자열. 길드섬에 비치된 회차 박스 번호 범위 [min..max]. 기본 1..30.
  // 제작자가 delivered 시점에 직접 박스 번호를 입력하면 이 범위 안에서만 허용.
  | 'craft_box_range_min'
  | 'craft_box_range_max'
  // 정수 문자열 (1..30). 박스에 들어간 아이템이 회수되지 않으면 expired 처리되어
  // 박스 풀에서 해제될 때까지의 일수. 기본 '7'.
  | 'craft_box_expiry_days'
  // 정수 문자열 (0..200). 집중 사용 시 추가로 적용되는 반환율 보너스 % 기본값.
  // 길드의 마스터리 분포에 따라 35~53 정도. 기본 '35'.
  | 'craft_focus_bonus_pct'
  // 공개 길드 프로필 (`/g/<slug>`) 활성화 토글. 'true' 일 때만 라우트가 렌더되고
  // 어드민 편집 화면이 켜진다. 단계적 롤아웃을 위한 길드 단위 게이트 — v1 은
  // 멘헤라만 'true', 나머지는 미설정(=false) 로 두고 사전 동의 후 전환.
  | 'guild_profile_enabled'
  // 프로필 페이지 hero 배경 배너 URL. 빈 문자열이면 단색 fallback. 파일은
  // 'guild-profiles' 스토리지 버킷에 업로드, 여기엔 공개 URL 을 저장한다.
  | 'guild_profile_banner_url'
  // 길드 한 줄 / 단락 소개. 최대 500자, 일반 텍스트 (마크다운 렌더 X — 공개
  // 페이지의 시각 일관성을 위해). 빈 문자열이면 섹션 자체 숨김.
  | 'guild_profile_description'
  // hero / 강조 색상의 사전 정의 팔레트 키. 'amber' (기본) | 'rose' | 'emerald'
  // | 'sky' | 'violet' | 'orange' | 'pink' | 'slate'. hex 자유 입력 X — 8 색
  // 큐레이션으로 시각 품질을 보장.
  | 'guild_profile_accent_color'
  // 4 개 섹션 노출 토글. 'true' / 'false' 문자열. 어떤 섹션을 외부에 보여줄지
  // 어드민이 결정 — 일부 길드는 멤버 명단/리기어 통계 노출을 원치 않을 수 있다.
  | 'guild_profile_show_members'
  | 'guild_profile_show_battles'
  | 'guild_profile_show_regear_stats'
  | 'guild_profile_show_leaderboard'
  // 추가 섹션 토글 (운영진 / 통계 섹션 wrapping / 무기 분포 / 라이벌 길드).
  // showStats 는 sub-toggle 4개를 묶는 래퍼. false 면 통계 섹션 자체 숨김.
  | 'guild_profile_show_admin_team'
  | 'guild_profile_show_stats'
  | 'guild_profile_show_weapons'
  | 'guild_profile_show_rivals'
  // 모집 상태. 'open' | 'selective' | 'closed'. open / selective 일 때만 모집
  // CTA 버튼이 표시된다 (Discord 초대 링크 또는 가이드 페이지로 연결).
  | 'guild_profile_recruitment_status'
  // 모집 상태가 closed 가 아닐 때 CTA 버튼이 가리킬 Discord 초대 URL. 빈 값이면
  // CTA 가 비활성으로 노출 (배지만 표시).
  | 'guild_profile_discord_invite_url'
  // 공개 프로필 hero 칩에 표시할 알비온 서버. ''(자동 — albion_guild_members 의
  // majority server) | 'east' | 'west' | 'europe'. 어드민이 명시적으로 override
  // 하지 않으면 빈 문자열이고 자동 감지 사용.
  | 'guild_profile_server'
  // 활동 시간대. 자유 텍스트 — 예: "KST 21시 ~ 24시", "주말 오후 + 평일 22시 이후".
  // 빈 문자열이면 hero 칩에서 숨김. 최대 100자 권장 (UI 칩 폭 제약).
  | 'guild_profile_active_hours'
  // 사용 언어 (csv: 'ko', 'ja', 'en' 중 하나 이상). 비어 있으면 hero 칩 숨김.
  // 입력은 어드민 폼이 csv 로 직렬화. 표시 시 i18n 라벨로 풀어 칩으로 노출.
  | 'guild_profile_languages'
  // 모집 중인 포지션 자유 텍스트. 예: "탱커/힐러 우선 모집". 모집 상태가 'closed'
  // 가 아닐 때만 노출. 빈 문자열이면 카드 숨김.
  | 'guild_profile_recruiting_roles'
  // 가입 절차 한 줄 요약. 예: "디코 입장 → 면접 → 본가입". 빈 값 = 카드 숨김.
  | 'guild_profile_join_steps'
  // 정기 이벤트 일정 자유 텍스트 (멀티라인 허용). 예: "화/목 22시 ZvZ\n토요일
  // 21시 갱킹". 빈 값 = 섹션 숨김.
  | 'guild_profile_event_schedule'
  // 길드 공개 페이지(`/g/<slug>`) 활동 섹션의 "이번 주 활동" KPI 줄 토글. 원래
  // 홈(`/`) 상단에 있던 위젯이 길드 공개 페이지로 이동했지만 (#208) 설정 키는
  // 그대로 유지 — 기존 길드의 'true' 가 즉시 새 위치에 반영되도록.
  // 'true' 일 때만 위젯이 렌더된다. 길드별 단계적 롤아웃 — 기본 OFF.
  | 'home_weekly_stats_enabled'
  // 홈 페이지 어드민 전용 "처리 대기" 카드 토글. admin 세션 + 'true' 일 때만 렌더.
  // 모바일에서 사이드바 햄버거를 열지 않아도 처리할 일을 한눈에 볼 수 있게.
  | 'home_admin_pending_card_enabled'
  // /me 페이지 "이번 주 내 활동" 미니 섹션 토글. 'true' 일 때만 렌더.
  // 길드별 단계적 롤아웃 — 기본 OFF, 검증된 길드만 'true'.
  | 'me_weekly_stats_enabled'
  // 길드 공개 페이지(`/g/<slug>`) 의 길드원 본인 대시보드 섹션 토글.
  // 'true' 일 때만 hero 직후에 4 카드 (잔액/킬·데스/리기어/거래) 가 노출된다.
  // 길드별 단계적 롤아웃 — 기본 OFF, 검증된 길드만 'true' 로 전환. OFF 일 때는
  // 비로그인 CTA 배너도 함께 숨겨 페이지 톤을 유지한다.
  | 'member_dashboard_enabled'
  // 매치업 분리 row 들을 통계/업적의 "전투 카운트" 류 메트릭에서 albion_battle_id
  // 단위로 묶어 1전투로 계산할지 토글. 'true' 면 묶음, 'false' 면 분리 카운트
  // (legacy). /battles 목록 표시는 영향 없음 — 어디까지나 카운트 메트릭에만
  // 적용. K/D/Fame 은 그룹 합산, outcome 은 main_opponent (가장 큰 force) 매치업
  // row 의 outcome 채택, low-engagement 컷은 그룹 합산값으로 재평가. 길드별
  // 단계적 롤아웃 — 기본 OFF, 검증된 길드만 'true'.
  | 'bundle_split_battles_in_stats'

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
