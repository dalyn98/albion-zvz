-- Lookup table for Discord avatars. We upsert on each login so any UI spot
-- that has a discord_id can resolve the current avatar hash without a round
-- trip to Discord. Avatar is nullable because a Discord account may not have
-- a custom avatar set.

create table if not exists public.guild_avatars (
  discord_id text primary key,
  username text not null,
  avatar text,
  updated_at timestamptz not null default now()
);

create index if not exists guild_avatars_updated_at_idx
  on public.guild_avatars (updated_at desc);

alter table public.guild_avatars enable row level security;

-- Only service role reads/writes. Client never queries this directly.
revoke all on public.guild_avatars from anon, authenticated;
