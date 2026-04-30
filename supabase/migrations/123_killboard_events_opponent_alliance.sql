-- 리기어 신청 / 킬·데스 카드에서 상대 길드명만 표시되던 것을 상대 연합명까지
-- 함께 보여주려고 한다 (#201). 알비온 API (`/players/{id}/kills` 등) 의
-- Killer/Victim 객체에 이미 `AllianceName` 이 포함돼 있으므로 새로 받아오는
-- 추가 비용은 없다.
--
-- 컬럼은 nullable — 알비온 API 가 길드 무소속/연합 미가입 캐릭터에 대해 null 을
-- 내려주는 경우가 있고, 기존 적재된 행은 backfill 없이 NULL 로 남아 UI 에서
-- 자연스럽게 길드만 표시되도록.

alter table public.killboard_events
  add column if not exists opponent_alliance text;
