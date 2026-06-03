-- 189: Event-level manual regear policy for FF / ganking events.
--
-- Existing combat events keep the role_rewards-based cap. Non-combat event
-- owners can optionally replace that cap with an event-local silver cap and
-- death count, or disable manual regear for that event.

alter table public.events
  add column if not exists regear_policy text not null default 'role',
  add column if not exists regear_silver_cap integer,
  add column if not exists regear_max_deaths_per_member integer;

alter table public.events
  drop constraint if exists events_regear_policy_chk;

alter table public.events
  add constraint events_regear_policy_chk
  check (regear_policy in ('role', 'event', 'disabled'));

alter table public.events
  drop constraint if exists events_regear_silver_cap_chk;

alter table public.events
  add constraint events_regear_silver_cap_chk
  check (regear_silver_cap is null or (regear_silver_cap >= 1 and regear_silver_cap <= 2000000000));

alter table public.events
  drop constraint if exists events_regear_max_deaths_chk;

alter table public.events
  add constraint events_regear_max_deaths_chk
  check (regear_max_deaths_per_member is null or (regear_max_deaths_per_member >= 1 and regear_max_deaths_per_member <= 10));

comment on column public.events.regear_policy is
  'Manual regear policy for this event: role=use role_rewards cap, event=use event-local cap, disabled=block manual regear. Combat events are forced to role by application code.';

comment on column public.events.regear_silver_cap is
  'Event-local manual regear silver cap used only when regear_policy=event.';

comment on column public.events.regear_max_deaths_per_member is
  'Event-local manual regear death limit used only when regear_policy=event.';
