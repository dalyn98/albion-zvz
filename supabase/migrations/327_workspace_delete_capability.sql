-- 327: Capability bit 36 is the dedicated WORKSPACE_DELETE authority.
--
-- It is intentionally separate from SETTINGS_GENERAL and never added to an
-- ordinary delegated settings preset. Existing GUILD_ADMIN resolution expands
-- to the current ALL_CAPABILITIES mask in application code.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.permission_role_grants
  drop constraint if exists permission_role_grants_capabilities_check;
alter table public.permission_role_grants
  add constraint permission_role_grants_capabilities_check
    check (capabilities between 1 and 137438953471);

alter table public.permission_user_overrides
  drop constraint if exists permission_user_overrides_capabilities_check;
alter table public.permission_user_overrides
  add constraint permission_user_overrides_capabilities_check
    check (
      capabilities_granted between 0 and 137438953471
      and capabilities_revoked between 0 and 137438953471
      and (capabilities_granted & capabilities_revoked) = 0
      and (
        revoked_at is not null
        or capabilities_granted <> 0
        or capabilities_revoked <> 0
      )
    );

do $$
declare
  v_function record;
  v_definition text;
  v_updated integer := 0;
begin
  for v_function in
    select procedure.oid
      from pg_proc procedure
      inner join pg_namespace namespace
        on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname in (
         'apply_permission_role_grant',
         'apply_permission_user_override'
       )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('68719476735' in v_definition) = 0 then
      raise exception 'PERMISSION_CAPABILITY_LIMIT_NOT_FOUND:%', v_function.oid;
    end if;
    execute replace(v_definition, '68719476735', '137438953471');
    v_updated := v_updated + 1;
  end loop;
  if v_updated <> 2 then
    raise exception 'PERMISSION_VALIDATOR_COUNT_MISMATCH:%', v_updated;
  end if;
end;
$$;

notify pgrst, 'reload schema';
