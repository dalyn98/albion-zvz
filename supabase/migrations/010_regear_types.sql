-- Split regear requests into two types:
--   death      — auto-paid at the role_rewards snapshot stored in `silver`.
--   overcharge — member submits a claimed amount with the screenshot; the
--                claim must be > 0 and ≤ `silver` (the role reward ceiling).
--
-- `silver` keeps its meaning as "role reward snapshot at request time" so it
-- continues to serve both as the death payout AND the overcharge ceiling.
-- `claimed_silver` is the actual credited amount when request_type='overcharge'.

alter table public.regear_requests
  add column if not exists request_type text not null default 'death'
    check (request_type in ('death', 'overcharge')),
  add column if not exists claimed_silver integer
    check (claimed_silver is null or claimed_silver >= 0);

-- Enforce type-specific claim shape at the DB layer so a bypass of the server
-- action (direct RPC / SQL) still can't credit more than the ceiling.
alter table public.regear_requests
  drop constraint if exists regear_requests_type_claim_valid;

alter table public.regear_requests
  add constraint regear_requests_type_claim_valid
    check (
      (request_type = 'death' and claimed_silver is null)
      or
      (request_type = 'overcharge' and claimed_silver is not null
       and claimed_silver > 0 and claimed_silver <= silver)
    );

-- Rewrite approve_regear_request: credit claimed_silver for overcharge,
-- silver for death. Concurrent-safe via FOR UPDATE on the request row.
create or replace function public.approve_regear_request(p_id uuid)
returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
  v_type    text;
  v_claimed integer;
  v_credit  integer;
begin
  select discord_id, silver, request_type, claimed_silver
    into v_discord, v_silver, v_type, v_claimed
    from regear_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_credit := case when v_type = 'overcharge' then v_claimed else v_silver end;

  update regear_requests
     set status = 'approved', resolved_at = now()
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, v_credit, 'regear_approved', p_id);
end;
$$;
