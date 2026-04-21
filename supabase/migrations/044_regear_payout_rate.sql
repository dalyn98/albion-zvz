-- Admin-configurable regear payout rate. Members claim an amount bounded by
-- their role_max ceiling; at approval time the credited silver is
-- claimed_silver × app_settings.regear_payout_rate_percent ÷ 100 (floor).
--
-- We persist the actual credited amount onto the request row so history
-- displays the real payout even after the admin changes the rate. The RPC
-- now takes `p_payout_silver` and trusts the caller to have applied the
-- current rate — a DB-side rate lookup would couple the PL function to the
-- app_settings key name and the server action already knows the rate anyway.
-- Legacy behaviour (payout = claimed) is preserved when the caller passes
-- NULL, which keeps migration 018/040 compatibility if anything bypasses
-- the new flow.

alter table public.regear_requests
  add column if not exists payout_silver integer;

-- Backfill approved rows: before this migration, payout always equalled
-- claimed_silver. This keeps history UI consistent after rollout.
update public.regear_requests
   set payout_silver = claimed_silver
 where status = 'approved'
   and payout_silver is null
   and claimed_silver is not null;

drop function if exists public.approve_regear_request(uuid, text, text);

create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_payout_silver integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
begin
  select discord_id, claimed_silver
    into v_discord, v_claimed
    from regear_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  -- Defensive bounds: never pay negative, never exceed the member's claim.
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, v_credit, 'regear_approved', p_id);
end;
$$;
