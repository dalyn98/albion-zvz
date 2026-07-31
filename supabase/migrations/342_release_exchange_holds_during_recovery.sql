-- 342: Keep point holds consistent when an older workflow closes a pending
-- exchange. Guild recovery predates migration 335 and updates only the legacy
-- resolution columns; normalize that transition inside the shared guard.

create or replace function public.guard_exchange_request_hold_contract()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status <> 'pending' then
    if new.status = 'approved' then
      if new.hold_status <> 'consumed'
         or new.held_points <> 0
         or new.hold_resolved_at is null then
        raise exception 'EXCHANGE_APPROVAL_HOLD_REQUIRED' using errcode = '23514';
      end if;
    elsif new.status in ('rejected', 'cancelled') then
      new.held_points := 0;
      new.hold_status := 'released';
      new.hold_resolved_at := coalesce(new.hold_resolved_at, now());
    end if;
    return new;
  end if;

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

comment on function public.guard_exchange_request_hold_contract() is
  'Fail-closed adapter guard that also releases point holds when compatible legacy recovery closes a pending exchange.';

notify pgrst, 'reload schema';
