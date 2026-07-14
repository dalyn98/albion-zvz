-- 259: Keep operational events out of generic slot-based participation metrics.
--
-- Alliance-content runs may still need an event for party/slot management while
-- their attendance is authoritatively counted by a separately confirmed
-- alliance-content session. This flag preserves the event and every operational
-- workflow (including regear), but excludes its slots from generic attendance
-- aggregates.

alter table public.events
  add column if not exists exclude_from_participation_stats boolean not null default false;

comment on column public.events.exclude_from_participation_stats is
  'When true, slot assignments are excluded from generic event participation statistics; operational event, battle, and regear data remain unchanged.';
