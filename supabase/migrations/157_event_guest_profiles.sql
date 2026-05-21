-- Event-scoped guest display profile.
--
-- Guests are Discord-authenticated but not Albion-verified. Their Discord
-- global profile name can be ambiguous in a one-off event, so each event gets
-- a small profile row with the nickname and UI language the guest chose for
-- that event only.

create table if not exists public.event_guest_profiles (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  discord_id text not null,
  display_name text not null check (char_length(display_name) between 2 and 32),
  preferred_language text not null check (preferred_language in ('ko','en','ja','zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, event_id, discord_id),
  foreign key (guild_id, discord_id)
    references public.guests(guild_id, discord_id)
    on delete cascade
);

create index if not exists event_guest_profiles_event_idx
  on public.event_guest_profiles (guild_id, event_id);

alter table public.event_guest_profiles enable row level security;
