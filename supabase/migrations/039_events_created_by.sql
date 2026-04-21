-- Track who created each event so non-admin members with the event-creator
-- role can edit *only their own* events (admins retain full access). Legacy
-- events predating this column stay null — they remain admin-only since we
-- can't retroactively attribute ownership. Stored as text (Discord ID) to
-- match how the rest of the schema references users.

alter table public.events
  add column if not exists created_by text;

create index if not exists events_created_by_idx on public.events (created_by);
