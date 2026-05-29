-- Performance pass:
-- 1) Keep point_ledger append-only as the source of truth, but maintain a
--    per-member balance projection for hot reads.
-- 2) Record cron durations and use table leases to prevent overlapping runs.

create table if not exists public.member_point_balances (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  balance bigint not null default 0,
  lifetime_earned bigint not null default 0,
  lifetime_spent bigint not null default 0,
  entries_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_id)
);

create index if not exists member_point_balances_guild_balance_idx
  on public.member_point_balances (guild_id, balance desc)
  where balance > 0;

create index if not exists point_ledger_guild_discord_idx
  on public.point_ledger (guild_id, discord_id);

create index if not exists point_ledger_guild_id_order_idx
  on public.point_ledger (guild_id, id);

create index if not exists point_ledger_guild_created_id_idx
  on public.point_ledger (guild_id, created_at, id);

insert into public.member_point_balances (
  guild_id,
  discord_id,
  balance,
  lifetime_earned,
  lifetime_spent,
  entries_count,
  updated_at
)
select
  guild_id,
  discord_id,
  coalesce(sum(delta), 0)::bigint as balance,
  coalesce(sum(greatest(delta, 0)), 0)::bigint as lifetime_earned,
  coalesce(sum(greatest(-delta, 0)), 0)::bigint as lifetime_spent,
  count(*)::integer as entries_count,
  coalesce(max(created_at), now()) as updated_at
from public.point_ledger
group by guild_id, discord_id
on conflict (guild_id, discord_id) do update
set
  balance = excluded.balance,
  lifetime_earned = excluded.lifetime_earned,
  lifetime_spent = excluded.lifetime_spent,
  entries_count = excluded.entries_count,
  updated_at = excluded.updated_at;

create or replace function public.apply_member_point_balance_delta(
  p_guild_id uuid,
  p_discord_id text,
  p_balance_delta bigint,
  p_lifetime_earned_delta bigint,
  p_lifetime_spent_delta bigint,
  p_entry_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id is null or p_discord_id is null then
    return;
  end if;

  insert into public.member_point_balances (
    guild_id,
    discord_id,
    balance,
    lifetime_earned,
    lifetime_spent,
    entries_count,
    updated_at
  )
  values (
    p_guild_id,
    p_discord_id,
    p_balance_delta,
    p_lifetime_earned_delta,
    p_lifetime_spent_delta,
    p_entry_delta,
    now()
  )
  on conflict (guild_id, discord_id) do update
  set
    balance = public.member_point_balances.balance + excluded.balance,
    lifetime_earned = public.member_point_balances.lifetime_earned + excluded.lifetime_earned,
    lifetime_spent = public.member_point_balances.lifetime_spent + excluded.lifetime_spent,
    entries_count = public.member_point_balances.entries_count + excluded.entries_count,
    updated_at = now();

  delete from public.member_point_balances
   where guild_id = p_guild_id
     and discord_id = p_discord_id
     and entries_count <= 0;
end;
$$;

create or replace function public.sync_member_point_balance_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_member_point_balance_delta(
      NEW.guild_id,
      NEW.discord_id,
      NEW.delta,
      greatest(NEW.delta, 0),
      greatest(-NEW.delta, 0),
      1
    );
    return NEW;
  elsif tg_op = 'UPDATE' then
    perform public.apply_member_point_balance_delta(
      OLD.guild_id,
      OLD.discord_id,
      -OLD.delta,
      case when OLD.delta > 0 then -OLD.delta else 0 end,
      case when OLD.delta < 0 then OLD.delta else 0 end,
      -1
    );
    perform public.apply_member_point_balance_delta(
      NEW.guild_id,
      NEW.discord_id,
      NEW.delta,
      greatest(NEW.delta, 0),
      greatest(-NEW.delta, 0),
      1
    );
    return NEW;
  elsif tg_op = 'DELETE' then
    perform public.apply_member_point_balance_delta(
      OLD.guild_id,
      OLD.discord_id,
      -OLD.delta,
      case when OLD.delta > 0 then -OLD.delta else 0 end,
      case when OLD.delta < 0 then OLD.delta else 0 end,
      -1
    );
    return OLD;
  end if;

  return null;
end;
$$;

drop trigger if exists point_ledger_member_balance_sync on public.point_ledger;
create trigger point_ledger_member_balance_sync
after insert or update or delete on public.point_ledger
for each row execute function public.sync_member_point_balance_from_ledger();

alter table public.member_point_balances enable row level security;

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  lease_until timestamptz,
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_started_idx
  on public.cron_runs (job_name, started_at desc);

create index if not exists cron_runs_status_started_idx
  on public.cron_runs (status, started_at desc);

create table if not exists public.cron_locks (
  job_name text primary key,
  run_id uuid not null,
  locked_at timestamptz not null default now(),
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists cron_locks_lease_until_idx
  on public.cron_locks (lease_until);

alter table public.cron_runs enable row level security;
alter table public.cron_locks enable row level security;

create or replace function public.try_start_cron_run(
  p_job_name text,
  p_lease_seconds integer default 600
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
begin
  if p_job_name is null or btrim(p_job_name) = '' then
    raise exception 'JOB_NAME_REQUIRED';
  end if;

  v_lease_until := v_now + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 600), 3600)));

  insert into public.cron_locks (job_name, run_id, locked_at, lease_until, updated_at)
  values (p_job_name, v_run_id, v_now, v_lease_until, v_now)
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

  insert into public.cron_runs (id, job_name, status, started_at, completed_at, duration_ms, error)
  values (v_run_id, p_job_name, 'skipped', v_now, clock_timestamp(), 0, 'lock-held');

  return query select v_run_id, false, 'lock-held'::text;
end;
$$;

create or replace function public.finish_cron_run(
  p_run_id uuid,
  p_status text,
  p_response jsonb default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz := clock_timestamp();
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'INVALID_CRON_STATUS';
  end if;

  update public.cron_runs
     set status = p_status,
         completed_at = v_completed_at,
         duration_ms = greatest(0, floor(extract(epoch from (v_completed_at - started_at)) * 1000)::integer),
         response = p_response,
         error = p_error
   where id = p_run_id
     and status = 'running';

  delete from public.cron_locks
   where run_id = p_run_id;
end;
$$;

revoke all on function public.apply_member_point_balance_delta(uuid, text, bigint, bigint, bigint, integer) from public;
revoke all on function public.apply_member_point_balance_delta(uuid, text, bigint, bigint, bigint, integer) from anon, authenticated;
grant execute on function public.apply_member_point_balance_delta(uuid, text, bigint, bigint, bigint, integer) to service_role;

revoke all on function public.sync_member_point_balance_from_ledger() from public;
revoke all on function public.sync_member_point_balance_from_ledger() from anon, authenticated;
grant execute on function public.sync_member_point_balance_from_ledger() to service_role;

revoke all on function public.try_start_cron_run(text, integer) from public;
revoke all on function public.try_start_cron_run(text, integer) from anon, authenticated;
grant execute on function public.try_start_cron_run(text, integer) to service_role;

revoke all on function public.finish_cron_run(uuid, text, jsonb, text) from public;
revoke all on function public.finish_cron_run(uuid, text, jsonb, text) from anon, authenticated;
grant execute on function public.finish_cron_run(uuid, text, jsonb, text) to service_role;

comment on table public.member_point_balances is
  'Hot-read projection of point_ledger balances. point_ledger remains the source of truth.';
comment on table public.cron_runs is
  'Cron execution history for duration/error observability.';
comment on table public.cron_locks is
  'Best-effort table leases that prevent overlapping cron runs.';
