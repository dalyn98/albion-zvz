-- 슈퍼어드민이 부여하는 테넌트별 Albion 자원 접근 영구 예외.
--
-- relation / trust_status 는 Gameinfo 로 확인한 사실을 계속 보존한다. 예외는
-- (guild_id, discord_id, albion_server, albion_player_id) 에 별도로 결합해,
-- 사용자가 다른 캐릭터로 바꾸면 자동으로 효력이 사라지도록 한다.
-- 회수/재부여 이력은 super_admin_audit_log 에 남기고 이 테이블은 현재 정책만
-- 보관한다.

create table if not exists public.albion_identity_resource_exceptions (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null
    check (discord_id ~ '^[0-9]{15,25}$'),

  albion_server text not null
    check (albion_server in ('west', 'east', 'europe')),
  albion_player_id text not null
    check (char_length(btrim(albion_player_id)) between 1 and 80),
  albion_player_name text not null
    check (char_length(btrim(albion_player_name)) between 2 and 32),

  reason text not null
    check (char_length(btrim(reason)) between 3 and 500),
  granted_by_discord_id text not null
    check (char_length(btrim(granted_by_discord_id)) between 1 and 128),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (guild_id, discord_id),
  unique (guild_id, albion_server, albion_player_id)
);

create index if not exists albion_identity_resource_exceptions_discord_idx
  on public.albion_identity_resource_exceptions (discord_id, updated_at desc);

comment on table public.albion_identity_resource_exceptions is
  '슈퍼어드민이 특정 테넌트의 정확한 Discord↔Albion 캐릭터 연결에 부여한 영구 자원 접근 예외.';

alter table public.albion_identity_resource_exceptions enable row level security;
revoke all on public.albion_identity_resource_exceptions from anon, authenticated;
