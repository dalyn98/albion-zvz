-- Retire the unapproved trial/absence product surface without deleting history.
--
-- Existing rows remain readable to service-role code so exports and account
-- ownership preservation stay possible. Normal application writes are removed:
-- the two public RPC entry points and direct service-role DML are revoked.
-- SECURITY DEFINER account-merge functions from migration 281 may still move
-- historical ownership as part of an explicit super-admin account merge.

revoke insert, update, delete
  on table public.member_trial_profiles
  from public, anon, authenticated, service_role;

revoke insert, update, delete
  on table public.member_absences
  from public, anon, authenticated, service_role;

grant select on table public.member_trial_profiles to service_role;
grant select on table public.member_absences to service_role;

revoke all
  on function public.save_member_trial(uuid, text, text, date, date, text, text)
  from public, anon, authenticated, service_role;

revoke all
  on function public.create_member_absence(uuid, text, date, date, text, date)
  from public, anon, authenticated, service_role;

comment on table public.member_trial_profiles is
  'Retired trial-review history. Preserved read-only for audit/export and explicit account-merge ownership maintenance; not an active product feature.';

comment on table public.member_absences is
  'Retired member-absence history. Preserved read-only for audit/export and explicit account-merge ownership maintenance; not used by event or attendance decisions.';

comment on function public.save_member_trial(uuid, text, text, date, date, text, text) is
  'Retired compatibility function. EXECUTE is intentionally revoked from all application roles.';

comment on function public.create_member_absence(uuid, text, date, date, text, date) is
  'Retired compatibility function. EXECUTE is intentionally revoked from all application roles.';
