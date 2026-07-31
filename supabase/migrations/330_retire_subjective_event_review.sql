-- 330: Retire subjective event AAR writes while preserving historical rows.
--
-- Event closeout is an objective, derived status surface. Existing AAR rows
-- remain available for a controlled historical audit, but the product no
-- longer creates, edits, or displays subjective wins/issues/action items.

revoke all privileges
  on table public.event_after_action_reviews
  from service_role;
grant select
  on table public.event_after_action_reviews
  to service_role;

create or replace function public.guard_retired_event_after_action_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Preserve tenant/event deletion semantics. Direct review mutation is retired.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'event_after_action_review_retired';
end;
$$;

drop trigger if exists guard_retired_event_after_action_review
  on public.event_after_action_reviews;
create trigger guard_retired_event_after_action_review
  before insert or update or delete
  on public.event_after_action_reviews
  for each row
  execute function public.guard_retired_event_after_action_review();

revoke all on function public.guard_retired_event_after_action_review()
  from public, anon, authenticated, service_role;

comment on table public.event_after_action_reviews is
  'Retired subjective event review archive. Historical rows are preserved read-only; new product writes and display are disabled.';
comment on function public.guard_retired_event_after_action_review() is
  'Rejects direct writes to the retired AAR archive while allowing parent cleanup cascades.';
