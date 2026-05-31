create table if not exists public.admin_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  topic text not null,
  source_table text not null,
  source_id text not null,
  delivery_kind text not null default 'channel' check (delivery_kind in ('channel', 'digest')),
  discord_message_id text,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (guild_id, topic, source_table, source_id, delivery_kind)
);

create index if not exists admin_notification_deliveries_guild_delivered_idx
  on public.admin_notification_deliveries (guild_id, delivered_at desc);

alter table public.admin_notification_deliveries enable row level security;
