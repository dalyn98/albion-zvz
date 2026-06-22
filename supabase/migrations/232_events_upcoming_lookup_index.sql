-- Speed up Discord `/agm events` and other "next upcoming event" lookups.
-- The query is tenant-scoped, published-only, not-started, and ordered by gather_at.
create index if not exists events_upcoming_lookup_idx
  on public.events (guild_id, status, gather_at)
  where battle_started_at is null;
