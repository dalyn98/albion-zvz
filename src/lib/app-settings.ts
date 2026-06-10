import { cache } from 'react'
import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import { SupabaseQueryError } from '@/lib/supabase-query-error'

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
  // into `guild_avatars.is_bomb_squad_caller` at login/member-sync, including
  // caller-role holders who do not have the active member role.
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
  // Integer string 1..100. Payout rate used instead of the base rate when the
  // requester attached a single-video YouTube proof link. Default '100'.
  | 'regear_video_payout_rate_percent'
  // 길드 상점 할인율. 실수 문자열, 범위 (0, 1], 기본 '1'(할인 없음).
  // 포인트와 실버는 1:1 동일 개념 — 수동 가격/자동 가격(AODP 실버 시세) 모두
  // 실버 단위이고 이 할인율을 곱해 /shop 에 노출할 최종 포인트를 계산한다.
  // 예: 실버 1,000,000 × 0.5 = 500,000p.
  | 'shop_discount_rate'
  // /shop 상단에 뜨는 관리자 공지 — 아이템 전달 방법 등을 자유롭게 안내.
  // 빈 문자열이면 배너 비표시.
  | 'shop_delivery_notice'
  // /shop 상단 전달 공지에 함께 표시할 이미지 URL. 빈 문자열이면 텍스트만 표시.
  | 'shop_delivery_notice_image_url'
  // /shop 상단 전달 공지 이미지 표시 크기. full | large | medium | small.
  | 'shop_delivery_notice_image_size'
  // 길드 상점 상자 로그 import 시 티어+인챈트 합 기준으로 행을 제외한다.
  // 빈 문자열이면 해당 하한/상한 조건 비활성. 예: T8.2 = 10.
  | 'shop_import_exclude_tier_enchant_sum_lte'
  | 'shop_import_exclude_tier_enchant_sum_gte'
  // 인게임 로그 기반 기능의 공식 운영 시작시각. 빈 문자열이면 과거 전체 허용.
  // 상자/사이펀은 이 시각 이전의 로그를 import / 집계 대상에서 제외한다.
  | 'log_start_shop_chest_at'
  | 'log_start_siphon_at'
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
  // Boolean 문자열. 'true' 면 품질을 시세 산정 축에서 제거 — 같은 (uniqueName,
  // enchant) 의 모든 품질 변종이 동일 자동가격을 공유한다. AODP 조회는 여전히
  // 모든 품질 데이터를 받지만, 결과 집계 시 품질 무시하고 (item, location) 단위
  // 가중 중앙값을 산출해 모든 품질 변종에 적용. 알비온 ZvZ 운영상 길드원이 품질
  // 차이에 별로 신경쓰지 않는다는 도메인 합의에 맞춤. 인벤토리 행 자체는 품질별
  // 로 유지 (재고 추적용). 자동 리기어도 같은 로직을 공유하므로 함께 적용된다.
  // 'false' (기본) 면 기존 동작 — 품질별 별도 가격 + quality fallback 체인.
  | 'aodp_quality_agnostic'
  // Phase 3 자동 리기어 전역 스위치. 'true' 면 이벤트 종료 후 cron 이 killboard
  // victim 이벤트 → AODP 시세 → 즉시 승인. 빌드별 opt-out 체크박스(slots.
  // auto_regear_excluded) 도 이 toggle 이 켜져 있을 때만 UI 에 노출.
  | 'auto_regear_enabled'
  // Boolean 문자열. 'true' 면 cron 이 AODP fallback 체인의 'low confidence' 슬롯
  // (redzone/bluezone 폴백 또는 history 표본<=1) 의 price 를 null 로 떨어뜨려
  // marketSilver 합산에서 제외하고 청구자가 직접 입력하도록 한다. 'false' (기본)
  // 면 기존 동작 유지 — confidence 정보만 UI 배지로 표시.
  | 'auto_regear_skip_low_confidence'
  // 자동 리기어 합산에서 제외할 슬롯 키 목록 (JSON array of SlotKey). 빈 배열
  // '[]' 면 모든 슬롯 포함 (기본). 음식/포션/탈것 등 길드 정책상 리기어 비대상
  // 슬롯을 골라 비우면 estimated_silver / gear_breakdown.items 양쪽에서 제외된다.
  // 매칭/판정 규칙(/battles 통과 여부) 자체는 영향 없음 — 합산 대상만 좁힘.
  | 'auto_regear_excluded_slots'
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
  // Boolean 문자열. 'true' 면 같은 알비온 연합으로 확인된 계정도 수동 리기어만
  // 신청 가능. 자동 리기어/상점/사이펀/환전/양도/기부는 계속 홈 길드 trusted
  // 멤버에게만 열어 둔다. 기본 'false'.
  | 'alliance_regear_enabled'
  // Boolean 문자열. 'true' 면 길드원이 "오버차지" 종류로 리기어 신청 가능 —
  // 길드 명령에 따른 오버차지로 장비가 파괴된 경우. 'false' 면 멤버 폼에 종류
  // 선택 자체가 안 보이고 모든 신청이 'death' 로 처리. 기본 'false'.
  | 'regear_overcharge_enabled'
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
  // Boolean 문자열. 'true' 면 해당 길드 서브도메인에서 Discord 없이 길드-local
  // Albion 계정을 만들 수 있다. 이 계정은 이벤트 신청과 리기어 신청만 허용된다.
  | 'local_guild_accounts_enabled'
  // 길드-local 계정 생성 시 입력하는 길드 초대 코드의 scrypt hash. 평문은 저장하지
  // 않는다. 빈 문자열이면 계정 생성 불가.
  | 'local_guild_invite_hash'
  // Boolean 문자열. 길드 단위 리기어 지급 모드 — 'true' 면 모든 신규 요청이
  // 'crafted' (제작자가 회차 박스로 전달), 'false' 면 'silver' (포인트 지급).
  // 멤버는 모드를 선택할 수 없고 길드 설정이 강제. 기본 'false'. /craft/queue 탭
  // 노출 여부도 이 값에 묶여 있어, 'false' 면 제작자/관리자에게도 탭이 숨겨진다.
  | 'craft_regear_enabled'
  // Boolean 문자열. 'true' 면 제작 리기어 요청/작업 슬롯에 망토까지 포함한다.
  // 기본 'false' 는 기존 무기/방어구 중심 제작 범위를 유지한다.
  | 'craft_regear_include_cape'
  // 정수 문자열. 길드섬에 비치된 회차 박스 번호 범위 [min..max]. 기본 1..30.
  // 제작자가 delivered 시점에 직접 박스 번호를 입력하면 이 범위 안에서만 허용.
  | 'craft_box_range_min'
  | 'craft_box_range_max'
  // 정수 문자열 (1..30). 박스에 들어간 아이템이 회수되지 않으면 expired 처리되어
  // 박스 풀에서 해제될 때까지의 일수. 기본 '7'.
  | 'craft_box_expiry_days'
  // 공개 길드 프로필 (`/g/<slug>`) 활성화 토글. 'true' 일 때 외부 방문자에게
  // 페이지가 공개되고 어드민 편집 화면이 켜진다. 기본 OFF, 길드 어드민이 공개
  // 범위를 확인한 뒤 직접 전환한다.
  | 'guild_profile_enabled'
  // 프로필 페이지 hero 배경 배너 URL. 빈 문자열이면 단색 fallback. 파일은
  // 'guild-profiles' 스토리지 버킷에 업로드, 여기엔 공개 URL 을 저장한다.
  | 'guild_profile_banner_url'
  // hero 영역에서 배너 이미지의 가시성. 정수 0-100 문자열. 위에 깔리는 어두운
  // 그라데이션은 텍스트 가독성을 위해 그대로 두고, 배너 자체의 opacity 만 조정.
  // 기본 '50' (이전 하드코드 0.4 보다 약간 밝게 — 다수 길드 배너가 묻혀 보였음).
  | 'guild_profile_banner_opacity'
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
  // "지금 길드는" 활동 섹션 (이번 주 KPI + 최근 추적된 전투 + 이번 주 탑 킬러)
  // 마스터 토글. false 면 데이터가 있어도 섹션 자체 숨김. 기존 길드의 가시성을
  // 깨지 않도록 기본 'true'.
  | 'guild_profile_show_activity'
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
  // 길드 홍보용 YouTube 영상/플레이리스트 URL. watch / youtu.be / playlist 형태만
  // 허용 — 임의 iframe src 는 XSS 벡터라 `toYoutubeEmbedUrl` sanitizer 가 화이트
  // 리스트 통과 못한 값은 저장 단계에서 거부. 빈 값 = 위젯 숨김.
  | 'guild_profile_youtube_url'
  // 길드 공개 페이지(`/g/<slug>`) 활동 섹션의 "이번 주 활동" KPI 줄 토글. 원래
  // 홈(`/`) 상단에 있던 위젯이 길드 공개 페이지로 이동했지만 (#208) 설정 키는
  // 그대로 유지 — 기존 길드의 'true' 가 즉시 새 위치에 반영되도록.
  // 'true' 일 때만 위젯이 렌더된다. 길드별 단계적 롤아웃 — 기본 OFF.
  | 'home_weekly_stats_enabled'
  // 홈 페이지 어드민 전용 "처리 대기" 카드 토글. admin 세션 + 'true' 일 때만 렌더.
  // 모바일에서 사이드바 햄버거를 열지 않아도 처리할 일을 한눈에 볼 수 있게.
  | 'home_admin_pending_card_enabled'
  // 관리자 전용 운영 알림. 이벤트 공지/개인 DM 과 분리된 내부 알림 채널이다.
  // enabled=true + channel_id 설정 + topic 활성화일 때만 전송된다.
  | 'admin_notifications_enabled'
  | 'admin_notification_channel_id'
  | 'admin_notification_role_ids'
  | 'admin_notification_topics'
  | 'admin_notification_digest_minutes'
  | 'last_admin_notification_digest_at'
  // Discord Quick Starter dashboard-managed panel draft + last published
  // message. Draft channel/message are intentionally separate from last
  // publish channel/message id so changing the target channel does not lose
  // the old message coordinates before the next publish.
  | 'quick_starter_panel_message'
  | 'quick_starter_panel_title'
  | 'quick_starter_panel_description'
  | 'quick_starter_panel_color'
  | 'quick_starter_panel_footer'
  | 'quick_starter_panel_channel_id'
  | 'quick_starter_panel_message_id'
  | 'quick_starter_panel_message_channel_id'
  | 'quick_starter_panel_published_at'
  // /me 페이지 "이번 주 내 활동" 미니 섹션 토글. 'true' 일 때만 렌더.
  // 길드별 단계적 롤아웃 — 기본 OFF, 검증된 길드만 'true'.
  | 'me_weekly_stats_enabled'
  // 길드 공개 페이지(`/g/<slug>`) 의 길드원 본인 대시보드 섹션 토글.
  // 'true' 일 때만 hero 직후에 4 카드 (잔액/킬·데스/리기어/거래) 가 노출된다.
  // 기본 OFF, 공개 프로필 설정에서 길드 어드민이 직접 전환한다. OFF 일 때는
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
//
// 한 request 안에서 같은 tenant 의 키를 여러 번 읽는 패턴이 압도적이라
// (예: /g/<slug> 22 키, /admin/dashboard/settings 27 키), key 단위 SELECT 대신
// (guild_id) 단위로 모든 키를 한 번에 가져와 React cache() 로 메모이즈한다.
// 콜사이트 시그니처는 보존 — getAppSetting 호출만 하는 코드는 그대로 동작.
// write 경로(server action)는 revalidatePath 로 다음 render cycle 의 cache 가
// 새로 만들어지므로 stale 우려 없음.
const getAllAppSettings = cache(
  async (guildId: string): Promise<Map<string, string>> => {
    const db = getAdminClient()
    const { data, error } = await db
      .from('app_settings')
      .select('key, value')
      .eq('guild_id', guildId)
    if (error) {
      log.error('[app-settings] lookup failed', error, { tenant_id: guildId })
      throw new SupabaseQueryError('App settings lookup failed', error)
    }
    const map = new Map<string, string>()
    for (const row of data ?? []) {
      if (typeof row.key === 'string' && typeof row.value === 'string') {
        map.set(row.key, row.value)
      }
    }
    return map
  },
)

export async function getAppSetting(
  key: AppSettingKey,
  fallback: string,
  guildId: string,
): Promise<string> {
  const all = await getAllAppSettings(guildId)
  return all.get(key) ?? fallback
}
