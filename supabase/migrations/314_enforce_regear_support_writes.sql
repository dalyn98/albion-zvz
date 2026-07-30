-- Fail closed for every database write that creates or mutates regear state.
-- Reads and tenant-delete cascades remain available so historical records are
-- preserved/readable while a guild is unsupported. Guild craft orders share
-- craft_tasks but are intentionally outside this regear-only gate.

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create or replace function public.is_regear_support_enabled(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.app_settings
     where guild_id = p_guild_id
       and key = 'regear_support_enabled'
       and value = 'true'
  );
$$;

revoke all on function public.is_regear_support_enabled(uuid) from public;
revoke all on function public.is_regear_support_enabled(uuid) from anon, authenticated;
grant execute on function public.is_regear_support_enabled(uuid) to service_role;

create or replace function public.enforce_regear_support_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_regear_support_enabled(new.guild_id)
     or (
       tg_op = 'UPDATE'
       and not public.is_regear_support_enabled(old.guild_id)
     ) then
    raise exception 'REGEAR_SUPPORT_DISABLED';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_regear_support_write() from public;
revoke all on function public.enforce_regear_support_write() from anon, authenticated;

drop trigger if exists regear_requests_require_support on public.regear_requests;
create trigger regear_requests_require_support
before insert or update on public.regear_requests
for each row execute function public.enforce_regear_support_write();

drop trigger if exists regear_windows_require_support on public.regear_windows;
create trigger regear_windows_require_support
before insert or update on public.regear_windows
for each row execute function public.enforce_regear_support_write();

-- A normal unsupported tenant may not delete history either. Tenant deletion
-- remains possible: once the parent tenants row is gone, FK cascades are
-- explicitly allowed through this trigger.
create or replace function public.enforce_regear_support_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.tenants where id = old.guild_id)
     and not public.is_regear_support_enabled(old.guild_id) then
    raise exception 'REGEAR_SUPPORT_DISABLED';
  end if;
  return old;
end;
$$;

revoke all on function public.enforce_regear_support_delete() from public;
revoke all on function public.enforce_regear_support_delete() from anon, authenticated;

drop trigger if exists regear_requests_require_support_delete on public.regear_requests;
create trigger regear_requests_require_support_delete
before delete on public.regear_requests
for each row execute function public.enforce_regear_support_delete();

drop trigger if exists regear_windows_require_support_delete on public.regear_windows;
create trigger regear_windows_require_support_delete
before delete on public.regear_windows
for each row execute function public.enforce_regear_support_delete();

create or replace function public.enforce_regear_craft_task_support_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
       new.task_kind = 'regear'
       or (
         tg_op = 'UPDATE'
         and old.task_kind = 'regear'
       )
     )
     and (
       not public.is_regear_support_enabled(new.guild_id)
       or (
         tg_op = 'UPDATE'
         and not public.is_regear_support_enabled(old.guild_id)
       )
     ) then
    raise exception 'REGEAR_SUPPORT_DISABLED';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_regear_craft_task_support_write() from public;
revoke all on function public.enforce_regear_craft_task_support_write() from anon, authenticated;

drop trigger if exists craft_tasks_require_regear_support on public.craft_tasks;
create trigger craft_tasks_require_regear_support
before insert or update on public.craft_tasks
for each row execute function public.enforce_regear_craft_task_support_write();

create or replace function public.enforce_regear_craft_task_support_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.task_kind = 'regear'
     and exists (select 1 from public.tenants where id = old.guild_id)
     and not public.is_regear_support_enabled(old.guild_id) then
    raise exception 'REGEAR_SUPPORT_DISABLED';
  end if;
  return old;
end;
$$;

revoke all on function public.enforce_regear_craft_task_support_delete() from public;
revoke all on function public.enforce_regear_craft_task_support_delete() from anon, authenticated;

drop trigger if exists craft_tasks_require_regear_support_delete on public.craft_tasks;
create trigger craft_tasks_require_regear_support_delete
before delete on public.craft_tasks
for each row execute function public.enforce_regear_craft_task_support_delete();

-- Unsupported delivered tasks are frozen as history. Filtering before UPDATE is
-- required because the trigger would otherwise abort the whole global sweep.
create or replace function public.expire_craft_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.craft_tasks
     set status = 'expired',
         expired_at = now()
   where status = 'delivered'
     and task_kind = 'regear'
     and expires_at is not null
     and expires_at <= now()
     and public.is_regear_support_enabled(guild_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_craft_tasks() from public;
revoke all on function public.expire_craft_tasks() from anon, authenticated;
grant execute on function public.expire_craft_tasks() to service_role;
