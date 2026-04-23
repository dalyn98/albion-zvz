-- Per-slot opt-out for manual regear submissions.
--
-- Parallel to migration 050's `auto_regear_excluded`: when true, the slot's
-- assignee cannot submit a manual regear request for the event. UI always
-- exposes the checkbox (unlike auto-regear which gates on a global toggle)
-- since manual regear has no such toggle.

alter table public.slots
  add column if not exists manual_regear_excluded boolean not null default false;
