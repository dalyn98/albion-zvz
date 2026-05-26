-- Build-sheet recruitment for large ZvZ events.
--
-- The guild's default build sheet is represented by existing slot_templates:
-- one template = one role/weapon full build. These tables store event-specific
-- role demand, party assignment authority, and member weapon preferences.

create table if not exists public.event_build_role_demands (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  party_number int not null check (party_number between 1 and 10),
  role_type text not null check (role_type in ('OffTanker', 'DefTanker', 'Sup', 'Healer', 'Dps')),
  required_count int not null default 0 check (required_count between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, event_id, party_number, role_type)
);

create table if not exists public.event_build_party_assigners (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  party_number int not null check (party_number between 1 and 10),
  caller_discord_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, event_id, party_number)
);

create table if not exists public.event_build_applications (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  applicant_discord_id text not null,
  applicant_username text not null,
  role_type text not null check (role_type in ('OffTanker', 'DefTanker', 'Sup', 'Healer', 'Dps')),
  preferences jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'cancelled')),
  assigned_party_number int check (assigned_party_number between 1 and 10),
  assigned_slot_id uuid references public.slots(id) on delete set null,
  selected_template_id uuid,
  selected_snapshot jsonb,
  assigned_by text,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, event_id, applicant_discord_id),
  check (jsonb_typeof(preferences) = 'array' and jsonb_array_length(preferences) between 1 and 3)
);

create index if not exists event_build_role_demands_event_idx
  on public.event_build_role_demands (guild_id, event_id, party_number);

create index if not exists event_build_party_assigners_event_idx
  on public.event_build_party_assigners (guild_id, event_id, party_number);

create index if not exists event_build_party_assigners_caller_idx
  on public.event_build_party_assigners (guild_id, event_id, caller_discord_id);

create index if not exists event_build_applications_event_idx
  on public.event_build_applications (guild_id, event_id, status, role_type);

create index if not exists event_build_applications_applicant_idx
  on public.event_build_applications (guild_id, applicant_discord_id, created_at desc);

alter table public.event_build_role_demands enable row level security;
alter table public.event_build_party_assigners enable row level security;
alter table public.event_build_applications enable row level security;

revoke all on public.event_build_role_demands from anon, authenticated;
revoke all on public.event_build_party_assigners from anon, authenticated;
revoke all on public.event_build_applications from anon, authenticated;

create or replace function public.set_build_sheet_recruitment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_build_role_demands_updated_at on public.event_build_role_demands;
create trigger set_event_build_role_demands_updated_at
  before update on public.event_build_role_demands
  for each row execute function public.set_build_sheet_recruitment_updated_at();

drop trigger if exists set_event_build_party_assigners_updated_at on public.event_build_party_assigners;
create trigger set_event_build_party_assigners_updated_at
  before update on public.event_build_party_assigners
  for each row execute function public.set_build_sheet_recruitment_updated_at();

drop trigger if exists set_event_build_applications_updated_at on public.event_build_applications;
create trigger set_event_build_applications_updated_at
  before update on public.event_build_applications
  for each row execute function public.set_build_sheet_recruitment_updated_at();
