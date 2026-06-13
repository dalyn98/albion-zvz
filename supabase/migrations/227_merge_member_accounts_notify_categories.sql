-- Fix merge_member_accounts after notification categories were split.
--
-- Migration 064 replaced notify_other with notify_ff + notify_ganking, but
-- migration 225's merge_member_accounts RPC still referenced notify_other.
-- Patch the existing function body in place so the rest of the account merge
-- logic stays identical to the deployed function.

do $$
declare
  v_sql text;
  v_next_sql text;
begin
  select pg_get_functiondef('public.merge_member_accounts(uuid,text,text,text,text)'::regprocedure)
    into v_sql;

  if v_sql is null then
    raise exception 'ACCOUNT_MERGE_FUNCTION_MISSING';
  end if;

  v_next_sql := replace(
    v_sql,
    $old$
    notify_combat = v_source_avatar.notify_combat,
    notify_other = v_source_avatar.notify_other,
    dm_lead_minutes = coalesce(v_source_avatar.dm_lead_minutes, dm_lead_minutes),
$old$,
    $new$
    notify_combat = v_source_avatar.notify_combat,
    notify_ff = v_source_avatar.notify_ff,
    notify_ganking = v_source_avatar.notify_ganking,
    dm_lead_minutes = coalesce(v_source_avatar.dm_lead_minutes, dm_lead_minutes),
$new$
  );

  if v_next_sql = v_sql then
    if v_sql like '%notify_ff = v_source_avatar.notify_ff%'
       and v_sql like '%notify_ganking = v_source_avatar.notify_ganking%'
       and v_sql not like '%notify_other = v_source_avatar.notify_other%' then
      v_next_sql := null;
    else
      raise exception 'ACCOUNT_MERGE_NOTIFY_COLUMN_PATCH_NOT_APPLIED';
    end if;
  end if;

  if v_next_sql is not null then
    execute v_next_sql;
  end if;
end;
$$;

revoke all on function public.merge_member_accounts(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.merge_member_accounts(uuid, text, text, text, text) to service_role;

comment on function public.merge_member_accounts(uuid, text, text, text, text) is
  'Super-admin support RPC: merge member-owned data from one Discord ID into another. Copies notify_ff/notify_ganking notification preferences; actor fields are intentionally preserved.';
