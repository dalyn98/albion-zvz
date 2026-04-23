-- 알비온 닉네임 인증 온보딩 필드. guild_avatars 에 부가 컬럼으로 두는 이유:
-- (1) 이미 discord_id 가 PK 이고 모든 로그인 유저에게 1:1 존재, (2) Discord
-- 프로필/길드 상태와 알비온 identity 를 한 행에서 읽을 수 있음. 미래 SaaS
-- tenant 확장 시 별도 tenants / members 테이블로 분리 필요하지만 현 단계에서는
-- YAGNI 원칙으로 확장만.
--
-- albion_verified_at is NULL = 미인증 (수동 입력했거나 길드 매칭 실패).
-- NULL 아님 = Gameinfo /players/{id}.GuildId 가 app_settings.albion_home_guild_id
-- 와 일치하여 인증된 상태.

-- 서버 코드는 기존 killboard.ts / app_settings.albion_server 와 동일하게
-- 'west'(Americas) | 'east'(Asia/SGP) | 'europe' 를 쓴다.
alter table public.guild_avatars
  add column if not exists albion_server text
    check (albion_server in ('west','east','europe')),
  add column if not exists albion_player_id text,
  add column if not exists albion_nickname text,
  add column if not exists albion_guild_id text,
  add column if not exists albion_verified_at timestamptz;

-- 같은 (서버, 플레이어 ID) 조합은 유일. player_id 가 NULL 인 행은 제외.
create unique index if not exists guild_avatars_albion_player_unique
  on public.guild_avatars (albion_server, albion_player_id)
  where albion_player_id is not null;

-- onboarding 강제 리다이렉트 판정 시 "아직 서버를 고르지 않은 멤버" 빠르게
-- 추려내기 위한 부분 인덱스.
create index if not exists guild_avatars_onboarding_pending_idx
  on public.guild_avatars (discord_id)
  where albion_server is null and withdrawn_at is null;

-- 홈 길드 UUID 는 app_settings 로 관리. 홈 서버는 기존 'albion_server' 키를
-- 그대로 재사용 (killboard sync 와 동일 서버). SaaS tenant 확장 시 tenants 테
-- 이블로 이전.
insert into public.app_settings (key, value) values
  ('albion_home_guild_id', '')
on conflict (key) do nothing;
