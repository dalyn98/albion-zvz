-- 운영진 카드 (`/g/<slug>`) 에 노출할 "디스코드 핸들" 보관 컬럼.
-- guild_avatars.username 은 OAuth 로 자동 채워지지만, 사용자가 친구추가/DM 보낼 때
-- 쓰는 디스플레이 핸들은 변경되거나 사용자가 다른 ID 를 알리고 싶을 수 있다.
-- 운영진 카드 클릭 시 클립보드 복사 대상이 이 값. NULL/빈 값이면 username 으로
-- fallback.

alter table public.guild_avatars
  add column if not exists public_discord_handle text;
