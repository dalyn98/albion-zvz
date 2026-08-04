-- Mature operations layer for the official support server. The Discord ticket
-- lifecycle remains the source of truth; AI output is advisory, staff-only,
-- and cannot mutate ticket workflow state.

alter table public.support_ticket_settings
  add column queue_channel_id text,
  add column ai_review_channel_id text,
  add column security_alert_channel_id text,
  add column status_channel_id text,
  add column known_issues_channel_id text,
  add column panel_version text,
  add column support_hours text not null default 'Monday-Friday, 01:00-10:00 UTC',
  add column ai_enabled boolean not null default true,
  add column ai_shadow_mode boolean not null default true;

alter table public.support_ticket_settings
  add constraint support_ticket_settings_queue_channel_id_check
    check (queue_channel_id is null or queue_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_ai_review_channel_id_check
    check (ai_review_channel_id is null or ai_review_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_security_alert_channel_id_check
    check (security_alert_channel_id is null or security_alert_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_status_channel_id_check
    check (status_channel_id is null or status_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_known_issues_channel_id_check
    check (known_issues_channel_id is null or known_issues_channel_id ~ '^[0-9]{5,30}$'),
  add constraint support_ticket_settings_support_hours_check
    check (char_length(btrim(support_hours)) between 1 and 160),
  add constraint support_ticket_settings_panel_version_check
    check (panel_version is null or char_length(panel_version) between 1 and 80);

alter table public.support_tickets
  add column triaged_at timestamptz,
  add column triaged_by_discord_id text,
  add column priority_updated_by_discord_id text,
  add column ai_status text not null default 'not_requested',
  add column ai_last_analyzed_at timestamptz;

alter table public.support_tickets
  add constraint support_tickets_triaged_by_check
    check (
      triaged_by_discord_id is null
      or char_length(btrim(triaged_by_discord_id)) between 1 and 128
    ),
  add constraint support_tickets_priority_updated_by_check
    check (
      priority_updated_by_discord_id is null
      or char_length(btrim(priority_updated_by_discord_id)) between 1 and 128
    ),
  add constraint support_tickets_ai_status_check
    check (ai_status in ('not_requested', 'pending', 'completed', 'skipped', 'failed'));

create table public.support_ticket_jobs (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  job_kind text not null default 'initial_triage'
    check (job_kind in ('initial_triage')),
  revision integer not null default 1 check (revision between 1 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, job_kind, revision)
);

create index support_ticket_jobs_claim_idx
  on public.support_ticket_jobs (status, available_at, id)
  where status in ('pending', 'running');

create table public.support_ticket_ai_analyses (
  id bigint generated always as identity primary key,
  job_id bigint not null unique references public.support_ticket_jobs(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  revision integer not null check (revision between 1 and 1000),
  model_id text not null check (char_length(model_id) between 3 and 160),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  category_suggestion text not null
    check (category_suggestion in ('account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  staff_summary text not null check (char_length(staff_summary) between 1 and 500),
  urgency_signal text not null
    check (urgency_signal in ('normal', 'high', 'urgent')),
  risk_flags text[] not null default '{}',
  pii_warning boolean not null default false,
  known_issue_candidates jsonb not null default '[]'::jsonb,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  notified_at timestamptz,
  review_channel_id text,
  review_message_id text,
  security_channel_id text,
  security_message_id text,
  created_at timestamptz not null default now(),
  check (review_channel_id is null or review_channel_id ~ '^[0-9]{5,30}$'),
  check (review_message_id is null or review_message_id ~ '^[0-9]{5,30}$'),
  check (security_channel_id is null or security_channel_id ~ '^[0-9]{5,30}$'),
  check (security_message_id is null or security_message_id ~ '^[0-9]{5,30}$'),
  unique (ticket_id, revision, prompt_version)
);

create index support_ticket_ai_analyses_ticket_idx
  on public.support_ticket_ai_analyses (ticket_id, created_at desc);

create index support_ticket_ai_analyses_notification_idx
  on public.support_ticket_ai_analyses (created_at)
  where notified_at is null;

create table public.support_known_issues (
  id uuid primary key default gen_random_uuid(),
  support_guild_id text not null
    references public.support_ticket_settings(support_guild_id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  public_summary text not null check (char_length(btrim(public_summary)) between 1 and 1500),
  category text not null
    check (category in ('account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other')),
  status text not null default 'investigating'
    check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  forum_post_id text check (forum_post_id is null or forum_post_id ~ '^[0-9]{5,30}$'),
  created_by_discord_id text not null
    check (char_length(btrim(created_by_discord_id)) between 1 and 128),
  updated_by_discord_id text not null
    check (char_length(btrim(updated_by_discord_id)) between 1 and 128),
  published_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (support_guild_id, slug)
);

create index support_known_issues_active_idx
  on public.support_known_issues (support_guild_id, status, updated_at desc);

create table public.support_ticket_known_issue_links (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  known_issue_id uuid not null references public.support_known_issues(id) on delete cascade,
  suggested_by text not null check (suggested_by in ('ai', 'rule', 'staff')),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  confirmed_by_discord_id text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (ticket_id, known_issue_id),
  check (
    (confirmed_by_discord_id is null and confirmed_at is null)
    or (
      char_length(btrim(confirmed_by_discord_id)) between 1 and 128
      and confirmed_at is not null
    )
  )
);

create table public.support_ticket_feedback (
  ticket_id uuid primary key references public.support_tickets(id) on delete cascade,
  helpful boolean not null,
  submitted_by_discord_id text not null
    check (char_length(btrim(submitted_by_discord_id)) between 1 and 128),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_ticket_sla_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  event_type text not null check (event_type in ('first_assignment', 'first_resolution')),
  target_at timestamptz not null,
  occurred_at timestamptz not null,
  breached boolean not null,
  created_at timestamptz not null default now(),
  unique (ticket_id, event_type)
);

create index support_ticket_sla_events_breach_idx
  on public.support_ticket_sla_events (breached, occurred_at desc);

alter table public.support_ticket_jobs enable row level security;
alter table public.support_ticket_ai_analyses enable row level security;
alter table public.support_known_issues enable row level security;
alter table public.support_ticket_known_issue_links enable row level security;
alter table public.support_ticket_feedback enable row level security;
alter table public.support_ticket_sla_events enable row level security;

revoke all on public.support_ticket_jobs from public, anon, authenticated;
revoke all on public.support_ticket_ai_analyses from public, anon, authenticated;
revoke all on public.support_known_issues from public, anon, authenticated;
revoke all on public.support_ticket_known_issue_links from public, anon, authenticated;
revoke all on public.support_ticket_feedback from public, anon, authenticated;
revoke all on public.support_ticket_sla_events from public, anon, authenticated;

create or replace function public.enqueue_support_ticket_ai_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if new.event_type <> 'ticket.provisioned' then return new; end if;

  select settings.ai_enabled into v_enabled
    from public.support_tickets as ticket
    join public.support_ticket_settings as settings
      on settings.support_guild_id = ticket.support_guild_id
   where ticket.id = new.ticket_id;

  if coalesce(v_enabled, false) then
    insert into public.support_ticket_jobs (ticket_id)
    values (new.ticket_id)
    on conflict (ticket_id, job_kind, revision) do nothing;

    update public.support_tickets
       set ai_status = 'pending', updated_at = now()
     where id = new.ticket_id
       and ai_status = 'not_requested';
  else
    update public.support_tickets
       set ai_status = 'skipped', updated_at = now()
     where id = new.ticket_id
       and ai_status = 'not_requested';
  end if;
  return new;
end;
$$;

create trigger support_ticket_enqueue_ai_after_event
after insert on public.support_ticket_events
for each row execute function public.enqueue_support_ticket_ai_job();

create or replace function public.record_support_ticket_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_target timestamptz;
begin
  select * into v_ticket from public.support_tickets where id = new.ticket_id;
  if not found then return new; end if;

  if new.event_type = 'ticket.assign' then
    v_target := v_ticket.created_at + case v_ticket.priority
      when 'urgent' then interval '30 minutes'
      when 'high' then interval '4 hours'
      else interval '24 hours'
    end;
    insert into public.support_ticket_sla_events (
      ticket_id, event_type, target_at, occurred_at, breached
    ) values (
      new.ticket_id, 'first_assignment', v_target, new.created_at,
      new.created_at > v_target
    ) on conflict (ticket_id, event_type) do nothing;
  elsif new.event_type = 'ticket.resolve' then
    v_target := v_ticket.created_at + case v_ticket.priority
      when 'urgent' then interval '8 hours'
      when 'high' then interval '24 hours'
      else interval '72 hours'
    end;
    insert into public.support_ticket_sla_events (
      ticket_id, event_type, target_at, occurred_at, breached
    ) values (
      new.ticket_id, 'first_resolution', v_target, new.created_at,
      new.created_at > v_target
    ) on conflict (ticket_id, event_type) do nothing;
  elsif new.event_type in ('ticket.close_requester', 'ticket.continue')
        and new.actor_kind = 'requester' then
    insert into public.support_ticket_feedback (
      ticket_id, helpful, submitted_by_discord_id, submitted_at, updated_at
    ) values (
      new.ticket_id,
      new.event_type = 'ticket.close_requester',
      new.actor_discord_id,
      new.created_at,
      new.created_at
    ) on conflict (ticket_id) do update set
      helpful = excluded.helpful,
      submitted_by_discord_id = excluded.submitted_by_discord_id,
      submitted_at = excluded.submitted_at,
      updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

create trigger support_ticket_record_operations_after_event
after insert on public.support_ticket_events
for each row execute function public.record_support_ticket_operations();

create or replace function public.claim_support_ticket_ai_jobs(
  p_worker_id text,
  p_limit integer default 10
) returns setof public.support_ticket_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(btrim(coalesce(p_worker_id, ''))) not between 1 and 128
     or p_limit not between 1 and 25 then
    raise exception 'invalid_support_ticket_ai_claim';
  end if;

  return query
  with candidates as (
    select job.id
      from public.support_ticket_jobs as job
     where (
       job.status = 'pending' and job.available_at <= now()
     ) or (
       job.status = 'running' and job.locked_at < now() - interval '15 minutes'
     )
     order by job.available_at, job.id
     for update skip locked
     limit p_limit
  )
  update public.support_ticket_jobs as job
     set status = 'running',
         attempts = least(job.attempts + 1, 100),
         locked_at = now(),
         locked_by = btrim(p_worker_id),
         updated_at = now()
    from candidates
   where job.id = candidates.id
  returning job.*;
end;
$$;

create or replace function public.complete_support_ticket_ai_job(
  p_job_id bigint,
  p_model_id text,
  p_prompt_version text,
  p_category_suggestion text,
  p_confidence numeric,
  p_staff_summary text,
  p_urgency_signal text,
  p_risk_flags text[],
  p_pii_warning boolean,
  p_known_issue_candidates jsonb,
  p_input_hash text,
  p_input_tokens integer,
  p_output_tokens integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.support_ticket_jobs;
begin
  select * into v_job
    from public.support_ticket_jobs
   where id = p_job_id
   for update;
  if not found then raise exception 'support_ticket_ai_job_not_found'; end if;

  insert into public.support_ticket_ai_analyses (
    job_id, ticket_id, revision, model_id, prompt_version,
    category_suggestion, confidence, staff_summary, urgency_signal,
    risk_flags, pii_warning, known_issue_candidates, input_hash,
    input_tokens, output_tokens
  ) values (
    v_job.id, v_job.ticket_id, v_job.revision,
    left(btrim(p_model_id), 160), left(btrim(p_prompt_version), 80),
    p_category_suggestion, p_confidence, left(btrim(p_staff_summary), 500),
    p_urgency_signal, coalesce(p_risk_flags, '{}'), coalesce(p_pii_warning, false),
    coalesce(p_known_issue_candidates, '[]'::jsonb), p_input_hash,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0)
  ) on conflict (job_id) do nothing;

  update public.support_ticket_jobs
     set status = 'completed', completed_at = now(), locked_at = null,
         locked_by = null, last_error = null, updated_at = now()
   where id = v_job.id;

  update public.support_tickets
     set ai_status = 'completed', ai_last_analyzed_at = now(), updated_at = now()
   where id = v_job.ticket_id;
end;
$$;

create or replace function public.fail_support_ticket_ai_job(
  p_job_id bigint,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_ticket_id uuid;
begin
  select attempts, ticket_id into v_attempts, v_ticket_id
    from public.support_ticket_jobs
   where id = p_job_id
   for update;
  if not found then return; end if;

  update public.support_ticket_jobs
     set status = case when v_attempts >= 5 then 'failed' else 'pending' end,
         available_at = now() + make_interval(mins => least(60, (2 ^ least(v_attempts, 5))::integer)),
         locked_at = null,
         locked_by = null,
         last_error = left(coalesce(p_error, 'unknown'), 1000),
         updated_at = now()
   where id = p_job_id;

  if v_attempts >= 5 then
    update public.support_tickets
       set ai_status = 'failed', updated_at = now()
     where id = v_ticket_id;
  end if;
end;
$$;

create or replace function public.set_support_ticket_priority(
  p_ticket_id uuid,
  p_priority text,
  p_actor_discord_id text,
  p_interaction_id text
) returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_previous text;
begin
  if p_priority not in ('normal', 'high', 'urgent')
     or char_length(btrim(coalesce(p_actor_discord_id, ''))) not between 1 and 128
     or char_length(btrim(coalesce(p_interaction_id, ''))) not between 1 and 128 then
    raise exception 'invalid_support_ticket_priority';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'support_ticket_not_found'; end if;
  if exists (select 1 from public.support_ticket_events where interaction_id = p_interaction_id) then
    return v_ticket;
  end if;

  v_previous := v_ticket.priority;
  update public.support_tickets
     set priority = p_priority,
         triaged_at = coalesce(triaged_at, now()),
         triaged_by_discord_id = coalesce(triaged_by_discord_id, p_actor_discord_id),
         priority_updated_by_discord_id = p_actor_discord_id,
         discord_sync_status = 'pending',
         updated_at = now()
   where id = p_ticket_id
  returning * into v_ticket;

  insert into public.support_ticket_events (
    ticket_id, interaction_id, event_type, actor_kind, actor_discord_id, details
  ) values (
    p_ticket_id, p_interaction_id, 'ticket.priority', 'staff', p_actor_discord_id,
    jsonb_build_object('previous', v_previous, 'current', p_priority)
  );
  return v_ticket;
end;
$$;

create or replace function public.link_support_ticket_known_issue(
  p_ticket_id uuid,
  p_known_issue_id uuid,
  p_actor_discord_id text,
  p_interaction_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_guild text;
  v_issue_guild text;
begin
  if char_length(btrim(coalesce(p_actor_discord_id, ''))) not between 1 and 128
     or char_length(btrim(coalesce(p_interaction_id, ''))) not between 1 and 128 then
    raise exception 'invalid_support_ticket_known_issue_actor';
  end if;
  select support_guild_id into v_ticket_guild from public.support_tickets where id = p_ticket_id;
  select support_guild_id into v_issue_guild from public.support_known_issues where id = p_known_issue_id;
  if v_ticket_guild is null or v_issue_guild is null or v_ticket_guild <> v_issue_guild then
    raise exception 'support_ticket_known_issue_not_found';
  end if;
  if exists (select 1 from public.support_ticket_events where interaction_id = p_interaction_id) then
    return;
  end if;

  insert into public.support_ticket_known_issue_links (
    ticket_id, known_issue_id, suggested_by, confirmed_by_discord_id, confirmed_at
  ) values (
    p_ticket_id, p_known_issue_id, 'staff', p_actor_discord_id, now()
  ) on conflict (ticket_id, known_issue_id) do update set
    suggested_by = 'staff',
    confirmed_by_discord_id = excluded.confirmed_by_discord_id,
    confirmed_at = excluded.confirmed_at;

  insert into public.support_ticket_events (
    ticket_id, interaction_id, event_type, actor_kind, actor_discord_id, details
  ) values (
    p_ticket_id, p_interaction_id, 'ticket.known_issue_linked', 'staff',
    p_actor_discord_id, jsonb_build_object('known_issue_id', p_known_issue_id)
  );
end;
$$;

revoke all on function public.claim_support_ticket_ai_jobs(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_support_ticket_ai_job(bigint, text, text, text, numeric, text, text, text[], boolean, jsonb, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.fail_support_ticket_ai_job(bigint, text)
  from public, anon, authenticated;
revoke all on function public.set_support_ticket_priority(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.link_support_ticket_known_issue(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_support_ticket_ai_jobs(text, integer) to service_role;
grant execute on function public.complete_support_ticket_ai_job(bigint, text, text, text, numeric, text, text, text[], boolean, jsonb, text, integer, integer) to service_role;
grant execute on function public.fail_support_ticket_ai_job(bigint, text) to service_role;
grant execute on function public.set_support_ticket_priority(uuid, text, text, text) to service_role;
grant execute on function public.link_support_ticket_known_issue(uuid, uuid, text, text) to service_role;

comment on table public.support_ticket_ai_analyses is
  'Staff-only advisory AI analysis. It never authorizes or performs a ticket action.';
comment on table public.support_ticket_jobs is
  'Durable, idempotent outbox for optional support-ticket AI analysis.';
comment on table public.support_known_issues is
  'Human-authored canonical incidents and known issues for the official support server.';
