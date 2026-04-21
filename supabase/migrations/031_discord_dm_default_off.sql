-- Discord DM 수신 기본값을 true → false 로 변경.
--
-- 배경: 030 에서 옵트아웃(기본 수신) 으로 열었으나, 운영진이 "명시적으로 켠
-- 사람에게만 보내자" 로 방향을 틀었다. 무음 기본이라 스팸 위험이 낮고,
-- 토글은 `/me/settings` 에서 한 번 누르면 즉시 반영.
--
-- 마이그 흐름:
--   1. 향후 새로 생성되는 guild_avatars/guests 레코드는 DEFAULT false.
--   2. 030 적용 이후 이미 true 로 시드된 기존 행도 전부 false 로 하향 —
--      이전 기본이 true 였을 뿐 사용자가 명시적으로 켠 상태가 아니기 때문.
--      추후 본인이 원하면 `/me/settings` 에서 직접 켠다.

ALTER TABLE guild_avatars
  ALTER COLUMN discord_dm_enabled SET DEFAULT false;

ALTER TABLE guests
  ALTER COLUMN discord_dm_enabled SET DEFAULT false;

UPDATE guild_avatars SET discord_dm_enabled = false WHERE discord_dm_enabled = true;
UPDATE guests        SET discord_dm_enabled = false WHERE discord_dm_enabled = true;
