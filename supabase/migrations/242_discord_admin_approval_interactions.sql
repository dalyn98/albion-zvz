alter table public.admin_notification_deliveries
  add column if not exists discord_channel_id text,
  add column if not exists action_status text,
  add column if not exists action_by_discord_id text,
  add column if not exists action_by_username text,
  add column if not exists action_at timestamptz;

create table if not exists public.admin_notification_interactions (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_interaction_id text not null,
  discord_channel_id text,
  topic text not null,
  source_table text not null,
  source_id text not null,
  action text not null,
  actor_discord_id text not null,
  actor_username text,
  result text not null,
  error text,
  created_at timestamptz not null default now(),
  unique (discord_interaction_id)
);

create index if not exists admin_notification_interactions_guild_created_idx
  on public.admin_notification_interactions (guild_id, created_at desc);

create index if not exists admin_notification_interactions_source_idx
  on public.admin_notification_interactions (guild_id, topic, source_table, source_id, created_at desc);

alter table public.admin_notification_interactions enable row level security;
