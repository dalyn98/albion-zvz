-- 300: Keep origin classification consistent for old and new application code.
--
-- The trigger makes the migration safe to apply before the matching code
-- deploy: legacy inserts that omit regear_origin_type are still classified.

create or replace function public.set_regear_request_origin_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.regear_origin_type := case
    when new.auto_generated then 'auto'
    when new.event_id is not null then 'event'
    else 'free_window'
  end;
  return new;
end;
$$;

drop trigger if exists set_regear_request_origin_type on public.regear_requests;
create trigger set_regear_request_origin_type
  before insert
  on public.regear_requests
  for each row
  execute function public.set_regear_request_origin_type();

alter table public.regear_requests
  alter column regear_origin_type set default 'event',
  alter column regear_origin_type set not null;

alter table public.regear_requests
  drop constraint if exists regear_requests_origin_type_chk;

alter table public.regear_requests
  add constraint regear_requests_origin_type_chk
  check (
    (regear_origin_type = 'auto' and auto_generated)
    or
    (
      regear_origin_type = 'event'
      and not auto_generated
      and regear_window_id is null
    )
    or
    (
      regear_origin_type = 'free_window'
      and not auto_generated
      and event_id is null
    )
  );

create index if not exists regear_requests_origin_status_idx
  on public.regear_requests (guild_id, regear_origin_type, status, created_at desc);
