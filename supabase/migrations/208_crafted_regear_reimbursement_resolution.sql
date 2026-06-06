-- 208: Crafted regear reimbursement resolution hardening.
--
-- Reimbursement approval must not depend on the member pickup state. A paid
-- crafter can deliver a regear task, then the requester may collect it before
-- an admin approves the reimbursement. Keep the reimbursement workflow
-- independent from craft task status, and add adjusted approval / rejection
-- paths for admin review.

alter table public.craft_tasks
  add column if not exists reimbursement_rejected_at timestamptz,
  add column if not exists reimbursement_rejected_by text,
  add column if not exists reimbursement_rejected_by_username text,
  add column if not exists reimbursement_reject_reason text;

alter table public.craft_tasks
  drop constraint if exists craft_tasks_reimbursement_status_chk;

alter table public.craft_tasks
  add constraint craft_tasks_reimbursement_status_chk
  check (reimbursement_status in ('not_required', 'pending', 'approved', 'rejected'));

create index if not exists idx_craft_tasks_regear_pending_reimbursement
  on public.craft_tasks (guild_id, reimbursement_status, status)
  where task_kind = 'regear' and reimbursement_status = 'pending';

create or replace function public.approve_craft_reimbursement(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_id text,
  p_admin_username text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crafter_discord_id text;
  v_reimbursement integer;
begin
  select crafter_discord_id, reimbursement_silver
    into v_crafter_discord_id, v_reimbursement
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and task_kind = 'regear'
     and status in ('delivered', 'collected', 'expired')
     and reimbursement_status = 'pending'
   for update;

  if not found or v_crafter_discord_id is null then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;
  if coalesce(v_reimbursement, 0) <= 0 then
    raise exception 'CRAFT_REIMBURSEMENT_EMPTY';
  end if;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_crafter_discord_id, v_reimbursement,
               'craft_reimbursement', p_task_id);

  update craft_tasks
     set reimbursement_status = 'approved',
         reimbursement_approved_at = now(),
         reimbursement_approved_by = p_admin_id,
         reimbursement_approved_by_username = p_admin_username,
         reimbursement_rejected_at = null,
         reimbursement_rejected_by = null,
         reimbursement_rejected_by_username = null,
         reimbursement_reject_reason = null
   where id = p_task_id
     and guild_id = p_guild_id
     and reimbursement_status = 'pending';

  if not found then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;

  return v_reimbursement;
end;
$$;

revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from public;
revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.approve_craft_reimbursement(uuid, uuid, text, text) to service_role;

create or replace function public.approve_craft_reimbursement_adjusted(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_reimbursement_silver integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crafter_discord_id text;
  v_original_reimbursement integer;
begin
  if p_reimbursement_silver is null or p_reimbursement_silver < 0 then
    raise exception 'CRAFT_REIMBURSEMENT_INVALID_AMOUNT';
  end if;

  select crafter_discord_id, reimbursement_silver
    into v_crafter_discord_id, v_original_reimbursement
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and task_kind = 'regear'
     and status in ('delivered', 'collected', 'expired')
     and reimbursement_status = 'pending'
   for update;

  if not found or v_crafter_discord_id is null then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;
  if coalesce(v_original_reimbursement, 0) <= 0 then
    raise exception 'CRAFT_REIMBURSEMENT_EMPTY';
  end if;
  if p_reimbursement_silver > v_original_reimbursement then
    raise exception 'CRAFT_REIMBURSEMENT_AMOUNT_EXCEEDS_REQUESTED';
  end if;

  if p_reimbursement_silver > 0 then
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, v_crafter_discord_id, p_reimbursement_silver,
                 'craft_reimbursement', p_task_id);
  end if;

  update craft_tasks
     set reimbursement_silver = p_reimbursement_silver,
         reimbursement_status = 'approved',
         reimbursement_approved_at = now(),
         reimbursement_approved_by = p_admin_id,
         reimbursement_approved_by_username = p_admin_username,
         reimbursement_rejected_at = null,
         reimbursement_rejected_by = null,
         reimbursement_rejected_by_username = null,
         reimbursement_reject_reason = null
   where id = p_task_id
     and guild_id = p_guild_id
     and reimbursement_status = 'pending';

  if not found then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;

  return p_reimbursement_silver;
end;
$$;

revoke all on function public.approve_craft_reimbursement_adjusted(uuid, uuid, text, text, integer) from public;
revoke all on function public.approve_craft_reimbursement_adjusted(uuid, uuid, text, text, integer) from anon, authenticated;
grant execute on function public.approve_craft_reimbursement_adjusted(uuid, uuid, text, text, integer) to service_role;

create or replace function public.reject_craft_reimbursement(
  p_task_id uuid,
  p_guild_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_reject_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement integer;
begin
  select reimbursement_silver
    into v_reimbursement
    from craft_tasks
   where id = p_task_id
     and guild_id = p_guild_id
     and task_kind = 'regear'
     and status in ('delivered', 'collected', 'expired')
     and reimbursement_status = 'pending'
   for update;

  if not found then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;
  if coalesce(v_reimbursement, 0) <= 0 then
    raise exception 'CRAFT_REIMBURSEMENT_EMPTY';
  end if;

  update craft_tasks
     set reimbursement_status = 'rejected',
         reimbursement_rejected_at = now(),
         reimbursement_rejected_by = p_admin_id,
         reimbursement_rejected_by_username = p_admin_username,
         reimbursement_reject_reason = nullif(left(coalesce(p_reject_reason, ''), 500), '')
   where id = p_task_id
     and guild_id = p_guild_id
     and reimbursement_status = 'pending';

  if not found then
    raise exception 'CRAFT_REIMBURSEMENT_NOT_PENDING';
  end if;

  return v_reimbursement;
end;
$$;

revoke all on function public.reject_craft_reimbursement(uuid, uuid, text, text, text) from public;
revoke all on function public.reject_craft_reimbursement(uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.reject_craft_reimbursement(uuid, uuid, text, text, text) to service_role;

comment on column public.craft_tasks.reimbursement_rejected_at is
  'When an admin rejected a pending crafter reimbursement.';
comment on column public.craft_tasks.reimbursement_reject_reason is
  'Optional admin-visible reason for rejecting a crafter reimbursement.';
