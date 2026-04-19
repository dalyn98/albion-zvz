-- Unify regear flow: every request now carries an explicit claimed_silver
-- within the role's silver ceiling. Previously death requests left
-- claimed_silver null (auto-paid the full silver) while overcharge requests
-- required an explicit claim. Admin asked to collapse that into a single
-- workflow where role_rewards.silver is purely an upper bound and members
-- always enter what they're claiming.
--
-- Data preservation: regear_requests.request_type is KEPT so historical
-- rows retain their death/overcharge label. Application code no longer
-- branches on it — it exists only for audit/history readability.

-- 1) Drop the old type-branched check first — it requires
--    (death → claimed_silver null), which blocks the backfill UPDATE below.
alter table public.regear_requests
  drop constraint if exists regear_requests_type_claim_valid;

-- 2) Backfill existing death rows (claimed_silver null) with their silver
--    snapshot so the new RPC credits the same amount they would have paid.
update public.regear_requests
   set claimed_silver = silver
 where claimed_silver is null;

-- 3) Require claimed_silver going forward.
alter table public.regear_requests
  alter column claimed_silver set not null;

-- 4) Add the unified bound. Lower bound is >=0 (not >0) so legacy rows where
--    the role reward was 0 at the time of approval still pass. The server
--    action separately enforces >0 for fresh submissions.
alter table public.regear_requests
  add constraint regear_requests_claim_bound
    check (claimed_silver >= 0 and claimed_silver <= silver);

-- 5) Rewrite approve_regear_request to always credit claimed_silver.
--    FOR UPDATE row lock still serializes concurrent approvers.
create or replace function public.approve_regear_request(p_id uuid)
returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
begin
  select discord_id, claimed_silver
    into v_discord, v_claimed
    from regear_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  update regear_requests
     set status = 'approved', resolved_at = now()
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, v_claimed, 'regear_approved', p_id);
end;
$$;
