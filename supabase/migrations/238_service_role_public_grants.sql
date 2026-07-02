-- Supabase CLI 2.109 local reset no longer leaves service_role with implicit
-- privileges on every object created by earlier migrations. RLS still denies
-- anon/authenticated by default; this only restores the server-side service
-- role contract used by getAdminClient() and integration tests.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;
