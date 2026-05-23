-- 161: Guild-local Albion accounts and event recruitment mode.
--
-- Local guild accounts are scoped to one tenant and use synthetic subjects
-- (`local:<uuid>`) in the same member-facing flows that already key by
-- discord_id. They are intentionally limited by application routing to event
-- signup and regear request flows.

create table if not exists public.guild_local_accounts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  subject text generated always as ('local:' || id::text) stored,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  albion_player_id text,
  albion_player_name text not null,
  current_guild_id text,
  current_guild_name text,
  current_alliance_id text,
  current_alliance_name text,
  relation text not null default 'unknown'
    check (relation in ('home_guild', 'alliance', 'external', 'unknown')),
  trust_status text not null default 'claimed'
    check (trust_status in ('claimed', 'trusted', 'revoked')),
  password_hash text not null,
  linked_discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists guild_local_accounts_subject_uniq
  on public.guild_local_accounts (subject);

create unique index if not exists guild_local_accounts_player_name_uniq
  on public.guild_local_accounts (guild_id, albion_server, lower(albion_player_name))
  where revoked_at is null;

create unique index if not exists guild_local_accounts_player_id_uniq
  on public.guild_local_accounts (guild_id, albion_server, albion_player_id)
  where albion_player_id is not null and revoked_at is null;

create index if not exists guild_local_accounts_guild_idx
  on public.guild_local_accounts (guild_id, updated_at desc);

alter table public.guild_local_accounts enable row level security;
revoke all on public.guild_local_accounts from anon, authenticated;

create or replace function public.set_guild_local_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_guild_local_accounts_updated_at on public.guild_local_accounts;
create trigger set_guild_local_accounts_updated_at
  before update on public.guild_local_accounts
  for each row execute function public.set_guild_local_accounts_updated_at();

alter table public.events
  add column if not exists recruitment_mode text not null default 'slots'
  check (recruitment_mode in ('slots', 'build_sheet', 'hybrid'));

create index if not exists events_recruitment_mode_idx
  on public.events (guild_id, recruitment_mode);

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'local_guild_accounts_enabled', 'false', now()
from public.tenants t
on conflict (guild_id, key) do nothing;

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'local_guild_invite_hash', '', now()
from public.tenants t
on conflict (guild_id, key) do nothing;
