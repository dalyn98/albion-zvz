-- 209: 슈퍼어드민 사이트 닉네임 override.
--
-- Discord ID 기준 전역 override 를 따로 보관한다. 기존 guild_avatars/guests 의
-- username 은 즉시 표시 호환성을 위해 같이 갱신하지만, 이후 새 tenant/guest
-- row 생성 시에도 같은 닉네임을 유지하려면 tenant row 가 아닌 전역 테이블이
-- 기준이어야 한다.

create table if not exists public.site_user_nickname_overrides (
  discord_id text primary key
    check (discord_id ~ '^[0-9]{15,25}$'),
  nickname text not null
    check (
      nickname = btrim(nickname)
      and char_length(nickname) between 1 and 32
      and nickname !~ '[[:cntrl:]]'
    ),
  updated_by_discord_id text not null
    check (updated_by_discord_id ~ '^[0-9]{15,25}$'),
  reason text
    check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_user_nickname_overrides_updated_at_idx
  on public.site_user_nickname_overrides (updated_at desc);

comment on table public.site_user_nickname_overrides is
  '슈퍼어드민이 지정한 Discord ID 기준 사이트 표시 닉네임 override.';

alter table public.site_user_nickname_overrides enable row level security;

revoke all on public.site_user_nickname_overrides from anon, authenticated;
