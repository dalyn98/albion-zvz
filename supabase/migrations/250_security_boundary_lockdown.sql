-- P0: PostgREST is not an application API boundary for this service. All
-- application reads and mutations are authorized in server actions and use
-- the service role. The original anonymous event/party/slot policies exposed
-- tenant roster, Discord identity, and regear-policy metadata directly.
--
-- Keep the privileged server path explicit and make every other database role
-- default-deny. New public data must be exposed through a redacted view or a
-- token-validated server route, never by granting a base table to anon.

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

drop policy if exists events_select on public.events;
drop policy if exists parties_select on public.parties;
drop policy if exists slots_select on public.slots;

notify pgrst, 'reload schema';
