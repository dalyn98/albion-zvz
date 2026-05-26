-- 171: Snapshot requester Albion relation on regear requests.
-- Alliance users may be allowed to submit manual regear only through
-- app_settings.alliance_regear_enabled. Automatic regear still skips non-home
-- trusted account identities.

alter table public.regear_requests
  add column if not exists requester_relation text not null default 'home_guild';

alter table public.regear_requests
  drop constraint if exists regear_requests_requester_relation_chk;

alter table public.regear_requests
  add constraint regear_requests_requester_relation_chk
  check (requester_relation in ('home_guild', 'alliance', 'external', 'unknown'));

create index if not exists regear_requests_guild_requester_relation_created_idx
  on public.regear_requests (guild_id, requester_relation, created_at desc);

comment on column public.regear_requests.requester_relation is
  'Snapshot of requester Albion relation at claim time. Alliance claims are manual-only and require alliance_regear_enabled.';
