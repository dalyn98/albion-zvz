-- 084: guild_avatars / guests 의 PK 를 (guild_id, discord_id) 복합 PK 로 변경.
--
-- 배경: 초기엔 단일 길드를 가정하고 `discord_id` 를 단일 컬럼 PK 로 선언했다
-- (migrations 008, 025). 멀티테넌트 전환(072) 에서 guild_id 컬럼을 추가했지만
-- PK 는 그대로였다. 같은 Discord 사용자가 두 길드에 가입할 경우 upsert 충돌
-- 로 덮어쓰기 버그가 발생한다. 이 마이그레이션은 PK 를 (guild_id, discord_id)
-- 복합으로 바꾸어 같은 사용자가 여러 tenant 에 안전하게 존재할 수 있도록 한다.
--
-- 참조 무결성: killboard_events.discord_id 가 guild_avatars(discord_id) 를
-- FK 로 참조하므로 먼저 떼고, PK 변경 후 복합 FK 로 재생성한다.

-- ────────────────────────────────────────────────────────────
-- 1) killboard_events FK 제거 — 과거 단일 컬럼 FK 와 별도로 추가됐을 수 있는
--    복합 FK 둘 다 방어적으로 drop. 마이그 중간에 실패해 이전 상태가 섞여
--    있어도 재실행이 안전하도록.
-- ────────────────────────────────────────────────────────────
alter table public.killboard_events
  drop constraint if exists killboard_events_discord_id_fkey;

alter table public.killboard_events
  drop constraint if exists killboard_events_guild_discord_fkey;

-- ────────────────────────────────────────────────────────────
-- 2) guild_avatars PK 재구성
-- ────────────────────────────────────────────────────────────
alter table public.guild_avatars
  drop constraint if exists guild_avatars_pkey;

alter table public.guild_avatars
  add constraint guild_avatars_pkey primary key (guild_id, discord_id);

-- ────────────────────────────────────────────────────────────
-- 3) guests PK 재구성
-- ────────────────────────────────────────────────────────────
alter table public.guests
  drop constraint if exists guests_pkey;

alter table public.guests
  add constraint guests_pkey primary key (guild_id, discord_id);

-- ────────────────────────────────────────────────────────────
-- 4) killboard_events FK 재생성 (composite)
--
-- 원래 FK 는 discord_id 만 참조했지만, guild_avatars 의 PK 가 복합으로 바뀐
-- 뒤에는 단일 컬럼 FK 를 걸 수 없다. killboard_events 에는 guild_id 가 이미
-- 있으니 (migration 072) 복합 FK 로 연결해 guild 경계도 함께 강제한다.
-- ────────────────────────────────────────────────────────────
alter table public.killboard_events
  add constraint killboard_events_guild_discord_fkey
    foreign key (guild_id, discord_id)
    references public.guild_avatars (guild_id, discord_id)
    on delete cascade;
