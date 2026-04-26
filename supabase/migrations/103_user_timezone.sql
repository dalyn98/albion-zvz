-- 사용자 본인의 시간대 (IANA 문자열). NULL = 길드 기본 시간대를 따른다.
-- 임박 DM 본문의 집결 시각이 이 시간대로 포맷된다 — 한국 길드에 가입한 EU/NA
-- 거주자가 본인 지역 시간으로 알람을 받을 수 있도록 하는 게 목적.
--
-- 알비온 4 서버 프리셋 IANA 만 허용한다는 비즈니스 룰은 lib/timezone.ts
-- isValidTenantTimezone 으로 검증 — DB 단에선 길이만 가볍게 체크해 향후
-- 프리셋 확장 여지를 둔다.

ALTER TABLE public.guild_avatars
  ADD COLUMN IF NOT EXISTS timezone text
  CHECK (timezone IS NULL OR length(timezone) <= 64);

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS timezone text
  CHECK (timezone IS NULL OR length(timezone) <= 64);
