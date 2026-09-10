-- Owner-only Codex dispatch for official support tickets. Discord is the
-- control plane, while a separately authenticated local worker runs Codex.
-- Ticket content is treated as untrusted input and all tables/RPCs remain
-- service-role only.

alter table public.support_ticket_settings
  add column codex_channel_id text,
  add column codex_panel_message_id text;

alter table public.support_ticket_settings
  add constraint support_ticket_settings_codex_channel_id_check
    check (codex_channel_id is null or codex_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_codex_panel_message_id_check
    check (codex_panel_message_id is null or codex_panel_message_id ~ '^[0-9]{5,30}$');

create table public.support_codex_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  parent_job_id uuid references public.support_codex_jobs(id) on delete restrict,
  support_guild_id text not null
    references public.support_ticket_settings(support_guild_id) on delete restrict,
  mode text not null check (mode in ('analyze', 'implement')),
  instruction text not null
    check (char_length(btrim(instruction)) between 1 and 2000),
  status text not null default 'pending_approval'
    check (status in (
      'pending_approval', 'queued', 'running', 'completed',
      'failed', 'cancelled', 'rejected'
    )),
  requested_by_discord_id text not null
    check (requested_by_discord_id = '490294888605155339'),
  approved_by_discord_id text
    check (
      approved_by_discord_id is null
      or approved_by_discord_id = '490294888605155339'
    ),
  request_interaction_id text not null unique
    check (request_interaction_id ~ '^[0-9]{5,30}$'),
  approval_interaction_id text unique
    check (
      approval_interaction_id is null
      or approval_interaction_id ~ '^[0-9]{5,30}$'
    ),
  control_channel_id text not null
    check (control_channel_id ~ '^[0-9]{5,30}$'),
  status_message_id text unique
    check (status_message_id is null or status_message_id ~ '^[0-9]{5,30}$'),
  base_git_sha text
    check (base_git_sha is null or base_git_sha ~ '^[a-f0-9]{40}$'),
  workspace_key uuid not null default gen_random_uuid(),
  codex_thread_id text
    check (
      codex_thread_id is null
      or char_length(btrim(codex_thread_id)) between 1 and 200
    ),
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  error_code text
    check (error_code is null or char_length(error_code) between 1 and 160),
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  approval_expires_at timestamptz not null default now() + interval '30 minutes',
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  lease_token uuid,
  lease_owner text
    check (lease_owner is null or char_length(btrim(lease_owner)) between 1 and 128),
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (approved_by_discord_id is null and approved_at is null)
    or (approved_by_discord_id is not null and approved_at is not null)
  ),
  check (octet_length(result::text) <= 30000)
);

create unique index support_codex_jobs_one_active_per_ticket
  on public.support_codex_jobs (ticket_id)
  where status in ('pending_approval', 'queued', 'running');

create index support_codex_jobs_claim_idx
  on public.support_codex_jobs (available_at, created_at)
  where status in ('queued', 'running');

create index support_codex_jobs_recent_idx
  on public.support_codex_jobs (support_guild_id, created_at desc);

create table public.support_codex_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.support_codex_jobs(id) on delete cascade,
  interaction_id text unique
    check (interaction_id is null or interaction_id ~ '^[0-9]{5,30}$'),
  event_type text not null
    check (char_length(btrim(event_type)) between 1 and 64),
  actor_kind text not null check (actor_kind in ('operator', 'worker', 'system')),
  actor_id text not null
    check (char_length(btrim(actor_id)) between 1 and 128),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  check (octet_length(details::text) <= 8000)
);

create index support_codex_job_events_job_idx
  on public.support_codex_job_events (job_id, created_at);

create table public.support_codex_workers (
  worker_id text primary key
    check (
      char_length(btrim(worker_id)) between 1 and 128
      and worker_id ~ '^[A-Za-z0-9._:-]+$'
    ),
  current_job_id uuid references public.support_codex_jobs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.support_codex_jobs enable row level security;
alter table public.support_codex_job_events enable row level security;
alter table public.support_codex_workers enable row level security;
revoke all on public.support_codex_jobs from public, anon, authenticated;
revoke all on public.support_codex_job_events from public, anon, authenticated;
revoke all on public.support_codex_workers from public, anon, authenticated;

create or replace function public.create_support_codex_job(
  p_support_guild_id text,
  p_ticket_id uuid,
  p_mode text,
  p_instruction text,
  p_actor_discord_id text,
  p_interaction_id text,
  p_control_channel_id text,
  p_base_git_sha text default null,
  p_parent_job_id uuid default null
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
  v_parent public.support_codex_jobs;
begin
  if p_actor_discord_id <> '490294888605155339'
     or p_support_guild_id !~ '^[0-9]{5,30}$'
     or p_control_channel_id !~ '^[0-9]{5,30}$'
     or p_interaction_id !~ '^[0-9]{5,30}$'
     or p_mode not in ('analyze', 'implement')
     or char_length(btrim(coalesce(p_instruction, ''))) not between 1 and 2000
     or (
       p_base_git_sha is not null
       and p_base_git_sha !~ '^[a-f0-9]{40}$'
     ) then
    raise exception 'invalid_support_codex_job_input';
  end if;

  select * into v_job
    from public.support_codex_jobs
   where request_interaction_id = p_interaction_id;
  if found then return v_job; end if;

  if not exists (
    select 1
      from public.support_tickets as ticket
     where ticket.id = p_ticket_id
       and ticket.support_guild_id = p_support_guild_id
       and ticket.thread_deleted_at is null
       and ticket.subject <> '[redacted]'
  ) then
    raise exception 'support_codex_ticket_not_available';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support-codex:' || p_ticket_id::text, 0));

  if exists (
    select 1 from public.support_codex_jobs
     where ticket_id = p_ticket_id
       and status in ('pending_approval', 'queued', 'running')
  ) then
    raise exception 'support_codex_job_active';
  end if;

  if (
    select count(*) from public.support_codex_jobs
     where requested_by_discord_id = p_actor_discord_id
       and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'support_codex_job_rate_limited';
  end if;

  if p_parent_job_id is not null then
    select * into v_parent
      from public.support_codex_jobs
     where id = p_parent_job_id
       and ticket_id = p_ticket_id
       and support_guild_id = p_support_guild_id
       and status = 'completed';
    if not found then raise exception 'support_codex_parent_not_available'; end if;
    if v_parent.mode <> p_mode then raise exception 'support_codex_parent_mode_mismatch'; end if;
  end if;

  insert into public.support_codex_jobs (
    ticket_id, parent_job_id, support_guild_id, mode, instruction,
    requested_by_discord_id, request_interaction_id, control_channel_id,
    base_git_sha, workspace_key, codex_thread_id
  ) values (
    p_ticket_id, p_parent_job_id, p_support_guild_id, p_mode, btrim(p_instruction),
    p_actor_discord_id, p_interaction_id, p_control_channel_id,
    coalesce(p_base_git_sha, v_parent.base_git_sha),
    coalesce(v_parent.workspace_key, gen_random_uuid()),
    v_parent.codex_thread_id
  ) returning * into v_job;

  insert into public.support_codex_job_events (
    job_id, interaction_id, event_type, actor_kind, actor_id,
    details
  ) values (
    v_job.id, p_interaction_id, 'job.requested', 'operator', p_actor_discord_id,
    jsonb_build_object('mode', p_mode, 'parent_job_id', p_parent_job_id)
  );
  return v_job;
end;
$$;

create or replace function public.approve_support_codex_job(
  p_job_id uuid,
  p_actor_discord_id text,
  p_interaction_id text
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
begin
  if p_actor_discord_id <> '490294888605155339'
     or p_interaction_id !~ '^[0-9]{5,30}$' then
    raise exception 'support_codex_operator_only';
  end if;
  select * into v_job from public.support_codex_jobs where id = p_job_id for update;
  if not found then raise exception 'support_codex_job_not_found'; end if;
  if exists (
    select 1 from public.support_codex_job_events where interaction_id = p_interaction_id
  ) then return v_job; end if;
  if v_job.status <> 'pending_approval' then
    raise exception 'invalid_support_codex_job_transition';
  end if;
  if v_job.approval_expires_at < now() then
    update public.support_codex_jobs
       set status = 'cancelled', completed_at = now(), error_code = 'approval_expired',
           updated_at = now()
     where id = p_job_id
    returning * into v_job;
    insert into public.support_codex_job_events (
      job_id, interaction_id, event_type, actor_kind, actor_id
    ) values (
      p_job_id, p_interaction_id, 'job.approval_expired', 'operator', p_actor_discord_id
    );
    return v_job;
  end if;

  update public.support_codex_jobs
     set status = 'queued',
         approved_by_discord_id = p_actor_discord_id,
         approval_interaction_id = p_interaction_id,
         approved_at = now(), available_at = now(), updated_at = now()
   where id = p_job_id
  returning * into v_job;

  insert into public.support_codex_job_events (
    job_id, interaction_id, event_type, actor_kind, actor_id
  ) values (
    p_job_id, p_interaction_id, 'job.approved', 'operator', p_actor_discord_id
  );
  return v_job;
end;
$$;

create or replace function public.cancel_support_codex_job(
  p_job_id uuid,
  p_actor_discord_id text,
  p_interaction_id text
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
begin
  if p_actor_discord_id <> '490294888605155339'
     or p_interaction_id !~ '^[0-9]{5,30}$' then
    raise exception 'support_codex_operator_only';
  end if;
  select * into v_job from public.support_codex_jobs where id = p_job_id for update;
  if not found then raise exception 'support_codex_job_not_found'; end if;
  if exists (
    select 1 from public.support_codex_job_events where interaction_id = p_interaction_id
  ) then return v_job; end if;

  if v_job.status in ('pending_approval', 'queued') then
    update public.support_codex_jobs
       set status = 'cancelled', cancel_requested_at = now(), completed_at = now(),
           error_code = 'cancelled_by_operator', updated_at = now()
     where id = p_job_id
    returning * into v_job;
  elsif v_job.status = 'running' then
    update public.support_codex_jobs
       set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
     where id = p_job_id
    returning * into v_job;
  end if;

  insert into public.support_codex_job_events (
    job_id, interaction_id, event_type, actor_kind, actor_id,
    details
  ) values (
    p_job_id, p_interaction_id, 'job.cancel_requested', 'operator', p_actor_discord_id,
    jsonb_build_object('status', v_job.status)
  );
  return v_job;
end;
$$;

create or replace function public.retry_support_codex_job(
  p_job_id uuid,
  p_actor_discord_id text,
  p_interaction_id text
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.support_codex_jobs;
  v_job public.support_codex_jobs;
begin
  if p_actor_discord_id <> '490294888605155339'
     or p_interaction_id !~ '^[0-9]{5,30}$' then
    raise exception 'support_codex_operator_only';
  end if;
  select * into v_job from public.support_codex_jobs
   where request_interaction_id = p_interaction_id;
  if found then return v_job; end if;

  select * into v_source from public.support_codex_jobs where id = p_job_id for update;
  if not found then raise exception 'support_codex_job_not_found'; end if;
  if v_source.status not in ('failed', 'cancelled') then
    raise exception 'invalid_support_codex_job_transition';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support-codex:' || v_source.ticket_id::text, 0));
  if exists (
    select 1 from public.support_codex_jobs
     where ticket_id = v_source.ticket_id
       and status in ('pending_approval', 'queued', 'running')
  ) then
    raise exception 'support_codex_job_active';
  end if;
  if (
    select count(*) from public.support_codex_jobs
     where requested_by_discord_id = p_actor_discord_id
       and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'support_codex_job_rate_limited';
  end if;

  insert into public.support_codex_jobs (
    ticket_id, parent_job_id, support_guild_id, mode, instruction,
    requested_by_discord_id, request_interaction_id, control_channel_id,
    base_git_sha, workspace_key, codex_thread_id
  ) values (
    v_source.ticket_id, v_source.id, v_source.support_guild_id, v_source.mode,
    v_source.instruction, p_actor_discord_id, p_interaction_id,
    v_source.control_channel_id, v_source.base_git_sha,
    v_source.workspace_key, v_source.codex_thread_id
  ) returning * into v_job;

  insert into public.support_codex_job_events (
    job_id, interaction_id, event_type, actor_kind, actor_id,
    details
  ) values (
    v_job.id, p_interaction_id, 'job.retry_requested', 'operator', p_actor_discord_id,
    jsonb_build_object('source_job_id', v_source.id)
  );
  return v_job;
end;
$$;

create or replace function public.claim_support_codex_job(
  p_worker_id text
) returns setof public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
  v_stale public.support_codex_jobs;
begin
  if char_length(btrim(coalesce(p_worker_id, ''))) not between 1 and 128 then
    raise exception 'invalid_support_codex_worker';
  end if;

  -- A timed-out HTTP response must not let the same worker claim a second
  -- job while its first lease is still active.
  select * into v_job
    from public.support_codex_jobs
   where status = 'running'
     and lease_owner = btrim(p_worker_id)
     and lease_expires_at >= now()
     and cancel_requested_at is null
   order by started_at
   limit 1;
  if found then
    insert into public.support_codex_workers (worker_id, current_job_id, last_seen_at)
    values (btrim(p_worker_id), v_job.id, now())
    on conflict (worker_id) do update
      set current_job_id = excluded.current_job_id, last_seen_at = excluded.last_seen_at;
    return next v_job;
    return;
  end if;

  for v_stale in
    update public.support_codex_jobs
       set status = 'cancelled', completed_at = now(), lease_token = null,
           lease_owner = null, lease_expires_at = null,
           error_code = 'cancelled_by_operator', updated_at = now()
     where status = 'running'
       and lease_expires_at < now()
       and cancel_requested_at is not null
    returning *
  loop
    update public.support_codex_workers
       set current_job_id = null, last_seen_at = now()
     where current_job_id = v_stale.id;
    insert into public.support_codex_job_events (
      job_id, event_type, actor_kind, actor_id, details
    ) values (
      v_stale.id, 'job.cancelled_after_lease_expiry', 'system', 'claim-sweeper',
      jsonb_build_object('attempts', v_stale.attempts)
    );
  end loop;

  for v_stale in
    update public.support_codex_jobs
       set status = 'failed', completed_at = now(), lease_token = null,
           lease_owner = null, lease_expires_at = null,
           error_code = 'worker_lease_exhausted', updated_at = now()
     where status = 'running'
       and lease_expires_at < now()
       and cancel_requested_at is null
       and attempts >= 3
    returning *
  loop
    update public.support_codex_workers
       set current_job_id = null, last_seen_at = now()
     where current_job_id = v_stale.id;
    insert into public.support_codex_job_events (
      job_id, event_type, actor_kind, actor_id, details
    ) values (
      v_stale.id, 'job.lease_exhausted', 'system', 'claim-sweeper',
      jsonb_build_object('attempts', v_stale.attempts)
    );
  end loop;

  with candidate as (
    select job.id
      from public.support_codex_jobs as job
     where (
       job.status = 'queued'
       and job.available_at <= now()
     ) or (
       job.status = 'running'
       and job.lease_expires_at < now()
       and job.cancel_requested_at is null
       and job.attempts < 3
     )
     order by job.available_at, job.created_at
     for update skip locked
     limit 1
  )
  update public.support_codex_jobs as job
     set status = 'running', attempts = job.attempts + 1,
         lease_token = gen_random_uuid(), lease_owner = btrim(p_worker_id),
         lease_expires_at = now() + interval '5 minutes',
         started_at = coalesce(job.started_at, now()), error_code = null,
         updated_at = now()
   from candidate
   where job.id = candidate.id
  returning job.* into v_job;

  insert into public.support_codex_workers (worker_id, current_job_id, last_seen_at)
  values (btrim(p_worker_id), v_job.id, now())
  on conflict (worker_id) do update
    set current_job_id = excluded.current_job_id, last_seen_at = excluded.last_seen_at;

  if v_job.id is not null then
    insert into public.support_codex_job_events (
      job_id, event_type, actor_kind, actor_id, details
    ) values (
      v_job.id, 'job.claimed', 'worker', btrim(p_worker_id),
      jsonb_build_object('attempts', v_job.attempts)
    );
    return next v_job;
  end if;
  return;
end;
$$;

create or replace function public.heartbeat_support_codex_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancel_requested boolean;
begin
  update public.support_codex_jobs
     set lease_expires_at = now() + interval '5 minutes', updated_at = now()
   where id = p_job_id
     and status = 'running'
     and lease_token = p_lease_token
     and lease_owner = btrim(p_worker_id)
  returning cancel_requested_at is not null into v_cancel_requested;
  if not found then raise exception 'support_codex_lease_lost'; end if;
  insert into public.support_codex_workers (worker_id, current_job_id, last_seen_at)
  values (btrim(p_worker_id), p_job_id, now())
  on conflict (worker_id) do update
    set current_job_id = excluded.current_job_id, last_seen_at = excluded.last_seen_at;
  return v_cancel_requested;
end;
$$;

create or replace function public.complete_support_codex_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_codex_thread_id text,
  p_base_git_sha text,
  p_result jsonb
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
begin
  if char_length(btrim(coalesce(p_worker_id, ''))) not between 1 and 128
     or char_length(btrim(coalesce(p_codex_thread_id, ''))) not between 1 and 200
     or p_base_git_sha !~ '^[a-f0-9]{40}$'
     or jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_result, '{}'::jsonb)::text) > 30000 then
    raise exception 'invalid_support_codex_result';
  end if;

  select * into v_job
    from public.support_codex_jobs
   where id = p_job_id
   for update;
  if not found then raise exception 'support_codex_job_not_found'; end if;
  if v_job.status = 'completed'
     and v_job.codex_thread_id = btrim(p_codex_thread_id)
     and v_job.base_git_sha = p_base_git_sha then
    return v_job;
  end if;
  if v_job.status <> 'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_owner is distinct from btrim(p_worker_id) then
    raise exception 'support_codex_lease_lost';
  end if;

  update public.support_codex_jobs
     set status = case when cancel_requested_at is null then 'completed' else 'cancelled' end,
         result = case when cancel_requested_at is null then p_result else '{}'::jsonb end,
         codex_thread_id = btrim(p_codex_thread_id), base_git_sha = p_base_git_sha,
         completed_at = now(), lease_token = null, lease_owner = null,
         lease_expires_at = null,
         error_code = case when cancel_requested_at is null then null else 'cancelled_by_operator' end,
         updated_at = now()
   where id = p_job_id
  returning * into v_job;

  insert into public.support_codex_job_events (
    job_id, event_type, actor_kind, actor_id,
    details
  ) values (
    p_job_id,
    case when v_job.status = 'completed' then 'job.completed' else 'job.cancelled' end,
    'worker', btrim(p_worker_id),
    jsonb_build_object('attempts', v_job.attempts)
  );
  update public.support_codex_workers
     set current_job_id = null, last_seen_at = now()
   where worker_id = btrim(p_worker_id);
  return v_job;
end;
$$;

create or replace function public.fail_support_codex_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean
) returns public.support_codex_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_codex_jobs;
  v_next_status text;
begin
  if char_length(btrim(coalesce(p_worker_id, ''))) not between 1 and 128
     or char_length(btrim(coalesce(p_error_code, ''))) not between 1 and 160 then
    raise exception 'invalid_support_codex_failure';
  end if;
  select * into v_job
    from public.support_codex_jobs
   where id = p_job_id
     and status = 'running'
     and lease_token = p_lease_token
     and lease_owner = btrim(p_worker_id)
   for update;
  if not found then raise exception 'support_codex_lease_lost'; end if;

  v_next_status := case
    when v_job.cancel_requested_at is not null then 'cancelled'
    when coalesce(p_retryable, false) and v_job.attempts < 3 then 'queued'
    else 'failed'
  end;

  update public.support_codex_jobs
     set status = v_next_status,
         available_at = case
           when v_next_status = 'queued'
             then now() + make_interval(mins => (2 ^ attempts)::integer)
           else available_at
         end,
         completed_at = case when v_next_status = 'queued' then null else now() end,
         lease_token = null, lease_owner = null, lease_expires_at = null,
         error_code = case
           when v_next_status = 'cancelled' then 'cancelled_by_operator'
           else left(btrim(p_error_code), 160)
         end,
         updated_at = now()
   where id = p_job_id
  returning * into v_job;

  insert into public.support_codex_job_events (
    job_id, event_type, actor_kind, actor_id,
    details
  ) values (
    p_job_id,
    case when v_next_status = 'queued' then 'job.retry_scheduled'
         when v_next_status = 'cancelled' then 'job.cancelled'
         else 'job.failed' end,
    'worker', btrim(p_worker_id),
    jsonb_build_object('error_code', v_job.error_code, 'attempts', v_job.attempts)
  );
  update public.support_codex_workers
     set current_job_id = null, last_seen_at = now()
   where worker_id = btrim(p_worker_id);
  return v_job;
end;
$$;

create or replace function public.set_support_codex_job_message(
  p_job_id uuid,
  p_channel_id text,
  p_message_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_channel_id !~ '^[0-9]{5,30}$'
     or p_message_id !~ '^[0-9]{5,30}$' then
    raise exception 'invalid_support_codex_message';
  end if;
  update public.support_codex_jobs
     set status_message_id = p_message_id, updated_at = now()
   where id = p_job_id
     and control_channel_id = p_channel_id;
  if not found then raise exception 'support_codex_job_not_found'; end if;
end;
$$;

revoke all on function public.create_support_codex_job(text, uuid, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.approve_support_codex_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_support_codex_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.retry_support_codex_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_support_codex_job(text)
  from public, anon, authenticated;
revoke all on function public.heartbeat_support_codex_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_support_codex_job(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_support_codex_job(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.set_support_codex_job_message(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.create_support_codex_job(text, uuid, text, text, text, text, text, text, uuid)
  to service_role;
grant execute on function public.approve_support_codex_job(uuid, text, text)
  to service_role;
grant execute on function public.cancel_support_codex_job(uuid, text, text)
  to service_role;
grant execute on function public.retry_support_codex_job(uuid, text, text)
  to service_role;
grant execute on function public.claim_support_codex_job(text)
  to service_role;
grant execute on function public.heartbeat_support_codex_job(uuid, uuid, text)
  to service_role;
grant execute on function public.complete_support_codex_job(uuid, uuid, text, text, text, jsonb)
  to service_role;
grant execute on function public.fail_support_codex_job(uuid, uuid, text, text, boolean)
  to service_role;
grant execute on function public.set_support_codex_job_message(uuid, text, text)
  to service_role;

comment on table public.support_codex_jobs is
  'Owner-approved Codex work for official support tickets; claimed only by an authenticated local worker.';
comment on table public.support_codex_job_events is
  'Append-only audit events for owner-only Codex dispatch.';
comment on table public.support_codex_workers is
  'Service-role-only liveness registry updated by signed Codex worker polling and heartbeats.';
