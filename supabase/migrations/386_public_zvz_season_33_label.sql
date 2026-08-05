-- Season 33 is the first public AGM Battles data season. Earlier setup used
-- the start date as its display name, which conflicts with the player-facing
-- season number shown by the board.
--
-- Forward rollback, if ever required:
--   update public.zvz_seasons
--   set name = 'Season 2026-07-24', updated_at = now()
--   where starts_on = date '2026-07-24' and name = 'Season 33';

update public.zvz_seasons
set
  name = 'Season 33',
  updated_at = now()
where starts_on = date '2026-07-24'
  and name = 'Season 2026-07-24';
