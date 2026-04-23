-- Phase 3: tenants 테이블에 Discord 설정을 옮긴다.
--
-- 배경: Phase 1/2 까지는 DISCORD_GUILD_ID / DISCORD_MEMBER_ROLE_ID / DISCORD_ADMIN_ROLE_ID /
-- DISCORD_EVENT_CHANNEL_ID 가 .env 에 박혀 있었다. 한 길드만 쓸 때는 문제없지만 신규 길드를
-- 온보딩하려면 길드마다 다른 값을 DB 에서 가져와야 한다.
--
-- 변경:
--   - member_role_ids text[]  NOT NULL default '{}' — 일반 멤버 판정용 Discord 역할 ID
--   - admin_role_ids  text[]  NOT NULL default '{}' — 관리자 판정용 역할 ID
--   - event_channel_id text              — 이벤트 알림 기본 채널 (events.notify_channel_id 가 NULL 일 때 fallback)
--   - bot_installed_at timestamptz        — /onboard 봇 초대 콜백이 기록. 아직 null 이면 "봇 미설치" UI 로 안내
--   - created_by_discord_id text          — 온보딩을 시작한 유저. 결제/지원 문의 연결용
--
-- 멘헤라(tenant #1) 는 현재 프로덕션 env 값으로 backfill — 앱이 env fallback 없이 DB 만 보고 동작할 수 있게.

alter table public.tenants
  add column if not exists member_role_ids      text[] not null default '{}'::text[],
  add column if not exists admin_role_ids       text[] not null default '{}'::text[],
  add column if not exists event_channel_id     text,
  add column if not exists bot_installed_at     timestamptz,
  add column if not exists created_by_discord_id text;

-- 멘헤라 tenant 값 시드. env 의 값과 일치 — 앱이 DB 기준으로 동작해도 기존과 동등.
-- (운영 Vercel env 의 DISCORD_EVENT_CHANNEL_ID 는 여기서 읽지 못하므로 NULL 로 두고,
--  /admin 설정 페이지 또는 psql 에서 수동으로 채워넣는다.)
update public.tenants
   set member_role_ids = array['1232276642747908126'],
       admin_role_ids  = array['1232276691880251393'],
       bot_installed_at = coalesce(bot_installed_at, created_at)
 where discord_guild_id = '1231989392277635102';

comment on column public.tenants.member_role_ids is
  '일반 멤버 판정 Discord 역할 ID 배열. 하나라도 가지면 isMember=true.';
comment on column public.tenants.admin_role_ids is
  '관리자 판정 Discord 역할 ID 배열. 하나라도 가지면 isAdmin=true.';
comment on column public.tenants.event_channel_id is
  '이벤트 알림 기본 Discord 채널 ID. events.notify_channel_id 가 null 일 때 fallback.';
comment on column public.tenants.bot_installed_at is
  '봇 초대 OAuth 콜백이 성공한 시각. null 이면 봇 미설치 상태 — 온보딩 미완.';
comment on column public.tenants.created_by_discord_id is
  '온보딩을 시작한 유저의 Discord ID. 결제/지원 contact 용.';
