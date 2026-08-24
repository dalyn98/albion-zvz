-- 420: Make interrupted cron executions observable. A hard function timeout
-- cannot execute finish_cron_run, so close the prior run when its lease is
-- reclaimed and provide a bounded maintenance RPC for orphaned rows.

create or replace function public.try_start_cron_run(
  p_job_name text,
  p_lease_seconds integer default 600,
  p_lock_name text default null
)
returns table(run_id uuid, started boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_lease_until timestamptz;
  v_acquired_run_id uuid;
  v_previous_run_id uuid;
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), p_job_name);
begin
  if p_job_name is null or btrim(p_job_name) = '' then
    raise exception 'JOB_NAME_REQUIRED';
  end if;

  v_lease_until := v_now + make_interval(
    secs => greatest(60, least(coalesce(p_lease_seconds, 600), 3600))
  );

  select lock.run_id
    into v_previous_run_id
  from public.cron_locks as lock
  where lock.job_name = v_lock_name
    and lock.lease_until <= v_now
  for update of lock;

  insert into public.cron_locks (job_name, run_id, locked_at, lease_until, updated_at)
  values (v_lock_name, v_run_id, v_now, v_lease_until, v_now)
  on conflict (job_name) do update
    set run_id = excluded.run_id,
        locked_at = excluded.locked_at,
        lease_until = excluded.lease_until,
        updated_at = excluded.updated_at
    where public.cron_locks.lease_until <= v_now
  returning public.cron_locks.run_id into v_acquired_run_id;

  if v_acquired_run_id = v_run_id then
    if v_previous_run_id is not null then
      update public.cron_runs
      set status = 'failed',
          completed_at = v_now,
          duration_ms = greatest(
            0,
            floor(extract(epoch from (v_now - started_at)) * 1000)::integer
          ),
          error = 'lease-expired'
      where id = v_previous_run_id
        and status = 'running';
    end if;

    insert into public.cron_runs (id, job_name, status, started_at, lease_until)
    values (v_run_id, p_job_name, 'running', v_now, v_lease_until);
    return query select v_run_id, true, null::text;
    return;
  end if;

  insert into public.cron_runs (
    id,
    job_name,
    status,
    started_at,
    completed_at,
    duration_ms,
    error
  )
  values (
    v_run_id,
    p_job_name,
    'skipped',
    v_now,
    clock_timestamp(),
    0,
    'lock-held'
  );

  return query select v_run_id, false, 'lock-held'::text;
end;
$$;

revoke all on function public.try_start_cron_run(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.try_start_cron_run(text, integer, text)
  to service_role;

create or replace function public.expire_stale_cron_runs(
  p_now timestamptz default clock_timestamp(),
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stale as (
    select run.id
    from public.cron_runs as run
    where run.status = 'running'
      and run.lease_until is not null
      and run.lease_until <= p_now
    order by run.lease_until
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
    for update skip locked
  ), expired as (
    update public.cron_runs as run
    set status = 'failed',
        completed_at = p_now,
        duration_ms = greatest(
          0,
          floor(extract(epoch from (p_now - run.started_at)) * 1000)::integer
        ),
        error = 'lease-expired'
    from stale
    where run.id = stale.id
      and run.status = 'running'
    returning run.id
  )
  select count(*)::integer into v_count from expired;

  delete from public.cron_locks as lock
  where lock.lease_until <= p_now
    and not exists (
      select 1
      from public.cron_runs as run
      where run.id = lock.run_id
        and run.status = 'running'
    );

  return v_count;
end;
$$;

revoke all on function public.expire_stale_cron_runs(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_cron_runs(timestamptz, integer)
  to service_role;

comment on function public.expire_stale_cron_runs(timestamptz, integer) is
  'Marks bounded expired running cron rows as failed and removes their orphaned locks.';
