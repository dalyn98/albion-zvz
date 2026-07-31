-- 333: Trigger functions are implementation details, not callable RPCs.
--
-- Migrations 331 and 332 installed these guards without overriding
-- PostgreSQL's default PUBLIC EXECUTE privilege. Direct invocation cannot
-- supply a trigger context, but keeping the privilege is unnecessary and
-- inconsistent with the rest of the event/member trigger boundary.

revoke all on function public.sync_event_guest_application_from_slot()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_guest_profile()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_guest_regear_setting()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_started_event_participation_requirement()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_event_regear_actual_participant()
  from public, anon, authenticated, service_role;

comment on function public.sync_event_guest_application_from_slot() is
  'Trigger-only guest application projection. Direct execution is revoked from every application role.';
comment on function public.guard_started_event_guest_profile() is
  'Trigger-only immutable guest-profile guard. Direct execution is revoked from every application role.';
comment on function public.guard_started_event_guest_regear_setting() is
  'Trigger-only immutable guest-regear setting guard. Direct execution is revoked from every application role.';
comment on function public.guard_started_event_participation_requirement() is
  'Trigger-only immutable closeout-requirement guard. Direct execution is revoked from every application role.';
comment on function public.guard_event_regear_actual_participant() is
  'Trigger-only actual-participant regear guard. Direct execution is revoked from every application role.';
