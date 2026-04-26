-- Multi-tenant SaaS: 같은 Albion 홈 길드(UUID) 가 두 tenant 에 동시에 등록되는
-- 것을 차단한다. UUID 는 Albion 게임 내 단일 길드를 식별하므로, 두 tenant 가
-- 같은 UUID 를 가리키면 "동일 길드용 사이트" 가 두 개 존재하게 되어 데이터/멤버
-- 관리가 갈라진다. 신규 가입 흐름에서 빠르게 실패시켜 사용자가 개발자에게
-- 문의하도록 유도한다.
--
-- 빈 문자열 ('') = "홈 길드 미설정" 상태. 위저드 skip 또는 관리자 페이지에서
-- 해제 시 발생. partial WHERE 절로 제외해 여러 tenant 가 동시에 unset 일 수 있게.
--
-- 인덱스 생성이 충돌하는 기존 데이터가 있다면 SQL 이 실패한다 — 그 경우 운영자
-- 가 수동으로 어느 tenant 가 점유할지 판정 후 다시 적용. (현재 실 운영 데이터에는
-- 단일 tenant 만 존재.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_albion_home_guild_id_unique
  ON public.app_settings (value)
  WHERE key = 'albion_home_guild_id' AND value <> '';
