-- All existing rows were backfilled by migration 393. Future writes must use
-- either the exact RPC or its backward-compatible midnight UTC wrapper.

update public.zvz_seasons
set starts_at = starts_on::timestamp at time zone 'UTC'
where starts_at is null;

alter table public.zvz_seasons
  alter column starts_at set not null;
