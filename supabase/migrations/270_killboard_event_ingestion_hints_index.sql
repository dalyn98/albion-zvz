-- Battle tracker backfill scans newly ingested killboard hints per tenant.
-- The event timestamp can be hours old when synchronization is delayed, so the
-- runtime query uses created_at and needs this tenant-first partial index.
create index if not exists idx_killboard_events_guild_created_battle
  on public.killboard_events (guild_id, created_at desc)
  where battle_id is not null;
