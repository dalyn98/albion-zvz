-- 341: Harden the Release B database-first deployment boundary.
--
-- The previous web build writes exchange_requests directly. After migration
-- 335 but before the matching application deployment, that legacy path must
-- fail closed instead of creating or resizing an unreserved pending request.
-- Existing legacy_unheld rows remain readable and resolvable by the 335 RPCs.

create or replace function public.guard_exchange_request_hold_contract()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if new.hold_status = 'held'
     and new.held_points = new.silver
     and new.held_at is not null
     and new.hold_resolved_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and old.hold_status = 'legacy_unheld'
     and old.held_points = 0
     and new.hold_status = 'legacy_unheld'
     and new.held_points = 0
     and new.silver = old.silver then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'EXCHANGE_SUBMIT_RPC_REQUIRED' using errcode = '23514';
  end if;
  raise exception 'EXCHANGE_PENDING_HOLD_REQUIRED' using errcode = '23514';
end;
$$;

revoke all on function public.guard_exchange_request_hold_contract()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_exchange_request_hold_contract
  on public.exchange_requests;
create trigger guard_exchange_request_hold_contract
before insert or update on public.exchange_requests
for each row execute function public.guard_exchange_request_hold_contract();

alter table public.exchange_requests
  add constraint exchange_requests_pending_hold_contract_check
  check (
    status <> 'pending'
    or (
      hold_status = 'held'
      and held_points = silver
      and held_at is not null
      and hold_resolved_at is null
    )
    or (
      hold_status = 'legacy_unheld'
      and held_points = 0
    )
  )
  not valid;

alter table public.exchange_requests
  validate constraint exchange_requests_pending_hold_contract_check;

-- Trigger functions are invoked by PostgreSQL, never through PostgREST.
-- Remove the two explicit service-role grants left by migration 336.
revoke all on function public.guard_shop_order_price_snapshot()
  from service_role;
revoke all on function public.supersede_shop_order_price_review_on_close()
  from service_role;

comment on function public.guard_exchange_request_hold_contract() is
  'Fail-closed adapter guard: new or resized pending exchanges must carry the atomic point hold established by the finance RPCs.';

notify pgrst, 'reload schema';
