-- Add a dedicated marketing screenshot slot for build-sheet recruitment.
-- Existing rows remain valid; this only widens the slot check constraint.
-- Rollback plan: use a new forward migration to remove 'builds' after deleting
-- or moving any marketing_screenshots rows with slot = 'builds'.

alter table public.marketing_screenshots
  drop constraint if exists marketing_screenshots_slot_check;

alter table public.marketing_screenshots
  add constraint marketing_screenshots_slot_check
  check (slot in ('events','regear','builds','craft','shop','stats'));
