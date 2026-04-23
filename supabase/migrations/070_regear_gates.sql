-- 리기어 인증 게이트 + 자동 리기어 선행 타이밍 설정.
--
-- 1) regear_require_verification: 'true' 면 알비온 닉네임 인증이 없는 길드원은
--    수동 리기어 신청이 차단된다. 기본 'true' (현재 항상-ON 동작 유지).
--    OFF 로 돌리면 `src/app/actions/regear.ts` 의 `requireAlbionVerified` 호출을
--    건너뛴다. 에러 응답에는 `ALBION_VERIFICATION_REQUIRED` 프리픽스가 붙어
--    클라이언트가 /onboarding/albion 으로 안내하는 CTA 를 렌더한다.
--
-- 2) auto_regear_delay_minutes: 배틀 시작으로부터 몇 분 뒤에 자동 리기어 크론이
--    처리할지. 기존엔 regear_window_minutes(=수동 신청 가능 시각) 와 동일해서
--    자동/수동이 동시에 열려 경합했고, 사용자 경험상 수동이 항상 먼저 들어와
--    auto_generated 건이 0 건 유지됐다. 이제 두 값을 분리:
--      - auto_regear_delay_minutes: 기본 15 (cron 이 이 분 경과 시 이벤트 처리)
--      - regear_window_minutes:     기본 60 (수동 신청 오픈 시점, 기존 유지)
--    killboard sync 지연 체크에도 이 값을 사용 — sync 가 battle_start + delay
--    이후 한 번이라도 돌았어야 victim 목록이 충분히 채워졌다고 간주.

insert into public.app_settings (key, value, updated_at)
values
  ('regear_require_verification', 'true', now()),
  ('auto_regear_delay_minutes',   '15',   now())
on conflict (key) do nothing;
