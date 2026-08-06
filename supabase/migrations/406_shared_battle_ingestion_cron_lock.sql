-- 406: Serialize the database-heavy battle ingestion jobs.
--
-- The public recovery scan, hot public collector, tenant battle tracker, and
-- killboard sync used independent leases even though they write and project
-- the same battle dataset. A slow recovery could therefore overlap every hot
-- job and exhaust the database. Keep each job name for observability while
-- allowing callers to acquire one shared concurrency key.

drop function if exists public.try_start_cron_run(text, integer);

create function public.try_start_cron_run(
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
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), p_job_name);
begin
  if p_job_name is null or btrim(p_job_name) = '' then
    raise exception 'JOB_NAME_REQUIRED';
  end if;

  v_lease_until := v_now + make_interval(
    secs => greatest(60, least(coalesce(p_lease_seconds, 600), 3600))
  );

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

comment on function public.try_start_cron_run(text, integer, text) is
  'Starts a named cron run while optionally serializing distinct jobs through a shared lock name.';
