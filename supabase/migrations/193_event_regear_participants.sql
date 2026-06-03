-- 193: Event-local manual regear participants for FF / ganking events.
--
-- FF and ganking parties change frequently, so slot assignment is not a stable
-- eligibility source for manual regear. This table snapshots the members who
-- may claim regear for a specific non-combat event.

create table if not exists public.event_regear_participants (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  discord_id text not null,
  username text not null,
  role_name text not null check (
    role_name in ('Caller', 'OffTanker', 'DefTanker', 'Sup', 'Healer', 'Dps', 'BM', '기타')
  ),
  added_by text,
  added_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_regear_participants_unique
  on public.event_regear_participants (guild_id, event_id, discord_id);

create index if not exists event_regear_participants_event_idx
  on public.event_regear_participants (guild_id, event_id);

create index if not exists event_regear_participants_member_idx
  on public.event_regear_participants (guild_id, discord_id);

create or replace function public.set_event_regear_participants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_regear_participants_updated_at on public.event_regear_participants;
create trigger set_event_regear_participants_updated_at
  before update on public.event_regear_participants
  for each row execute function public.set_event_regear_participants_updated_at();

alter table public.event_regear_participants enable row level security;

comment on table public.event_regear_participants is
  'Event-local manual regear eligibility list for FF/ganking events. Managed by admins or the event creator.';
