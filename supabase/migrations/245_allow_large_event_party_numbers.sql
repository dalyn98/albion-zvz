-- 245: Combat ZvZ rosters can exceed 20 parties.
-- Keep per-party slot count at 20; this only widens valid party numbers.

alter table public.parties
  drop constraint if exists parties_party_number_check;
alter table public.parties
  add constraint parties_party_number_check
  check (party_number between 1 and 99);

alter table public.event_build_role_demands
  drop constraint if exists event_build_role_demands_party_number_check;
alter table public.event_build_role_demands
  add constraint event_build_role_demands_party_number_check
  check (party_number between 1 and 99);

alter table public.event_build_party_assigners
  drop constraint if exists event_build_party_assigners_party_number_check;
alter table public.event_build_party_assigners
  add constraint event_build_party_assigners_party_number_check
  check (party_number between 1 and 99);

alter table public.event_build_applications
  drop constraint if exists event_build_applications_assigned_party_number_check;
alter table public.event_build_applications
  add constraint event_build_applications_assigned_party_number_check
  check (assigned_party_number is null or assigned_party_number between 1 and 99);
