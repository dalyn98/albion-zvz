-- Official support-server ticket workflow. This is intentionally platform-
-- scoped rather than tenant-scoped: a requester may have no tenant yet or may
-- need help choosing between multiple tenants. All access is service-role only.

create table if not exists public.support_ticket_settings (
  support_guild_id text primary key
    check (support_guild_id ~ '^[0-9]{5,30}$'),
  parent_channel_id text not null
    check (parent_channel_id ~ '^[0-9]{5,30}$'),
  log_channel_id text
    check (log_channel_id is null or log_channel_id ~ '^[0-9]{5,30}$'),
  panel_message_id text
    check (panel_message_id is null or panel_message_id ~ '^[0-9]{5,30}$'),
  staff_role_ids text[] not null default '{}',
  enabled boolean not null default false,
  waiting_reminder_hours integer not null default 72
    check (waiting_reminder_hours between 1 and 720),
  auto_close_hours integer not null default 168
    check (auto_close_hours between 24 and 2160),
  retention_days integer not null default 90
    check (retention_days between 7 and 730),
  updated_by_discord_id text not null
    check (char_length(btrim(updated_by_discord_id)) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(staff_role_ids) between 1 and 20),
  check (
    array_to_string(staff_role_ids, ',')
      ~ '^[0-9]{5,30}(,[0-9]{5,30})*$'
  )
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  support_guild_id text not null
    references public.support_ticket_settings(support_guild_id)
    on delete restrict,
  opener_discord_id text not null
    check (opener_discord_id ~ '^[0-9]{5,30}$'),
  opener_name_snapshot text not null
    check (char_length(btrim(opener_name_snapshot)) between 1 and 80),
  opener_locale text not null default 'ko'
    check (opener_locale in ('ko', 'ja', 'en', 'zh')),
  related_tenant_id uuid references public.tenants(id) on delete set null,
  related_guild_hint text
    check (related_guild_hint is null or char_length(related_guild_hint) between 1 and 100),
  category text not null
    check (category in ('account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other')),
  subject text not null
    check (char_length(subject) between 1 and 100),
  description text not null
    check (char_length(description) between 1 and 1500),
  status text not null default 'provisioning'
    check (status in (
      'provisioning', 'open', 'in_progress', 'waiting_requester',
      'resolved', 'closed', 'provision_failed'
    )),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  assignee_discord_id text
    check (assignee_discord_id is null or assignee_discord_id ~ '^[0-9]{5,30}$'),
  thread_id text unique
    check (thread_id is null or thread_id ~ '^[0-9]{5,30}$'),
  header_message_id text
    check (header_message_id is null or header_message_id ~ '^[0-9]{5,30}$'),
  create_interaction_id text not null unique
    check (create_interaction_id ~ '^[0-9]{5,30}$'),
  discord_sync_status text not null default 'pending'
    check (discord_sync_status in ('pending', 'synced', 'failed')),
  discord_sync_attempts integer not null default 0
    check (discord_sync_attempts between 0 and 1000),
  discord_sync_error text,
  assigned_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_reminded_at timestamptz,
  thread_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_tickets_one_active_per_opener
  on public.support_tickets (support_guild_id, opener_discord_id)
  where status in (
    'provisioning', 'open', 'in_progress', 'waiting_requester', 'resolved'
  );

create index if not exists support_tickets_status_updated_idx
  on public.support_tickets (support_guild_id, status, updated_at);

create index if not exists support_tickets_retention_idx
  on public.support_tickets (support_guild_id, closed_at)
  where status = 'closed' and thread_deleted_at is null;

create table if not exists public.support_ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  interaction_id text,
  event_type text not null
    check (char_length(btrim(event_type)) between 1 and 64),
  actor_kind text not null
    check (actor_kind in ('requester', 'staff', 'system')),
  actor_discord_id text not null
    check (char_length(btrim(actor_discord_id)) between 1 and 128),
  previous_status text,
  new_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists support_ticket_events_interaction_unique
  on public.support_ticket_events (interaction_id)
  where interaction_id is not null;

create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events (ticket_id, created_at);

alter table public.support_ticket_settings enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_events enable row level security;

revoke all on public.support_ticket_settings from public, anon, authenticated;
revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_ticket_events from public, anon, authenticated;

create or replace function public.reserve_support_ticket(
  p_support_guild_id text,
  p_opener_discord_id text,
  p_opener_name text,
  p_opener_locale text,
  p_related_tenant_id uuid,
  p_related_guild_hint text,
  p_category text,
  p_subject text,
  p_description text,
  p_interaction_id text
) returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if p_support_guild_id !~ '^[0-9]{5,30}$'
     or p_opener_discord_id !~ '^[0-9]{5,30}$'
     or p_interaction_id !~ '^[0-9]{5,30}$'
     or p_opener_locale not in ('ko', 'ja', 'en', 'zh')
     or p_category not in ('account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other')
     or char_length(btrim(coalesce(p_opener_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 100
     or char_length(btrim(coalesce(p_description, ''))) not between 1 and 1500
     or (
       p_related_guild_hint is not null
       and char_length(btrim(p_related_guild_hint)) not between 1 and 100
     ) then
    raise exception 'invalid_support_ticket_input';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_support_guild_id || ':support-ticket:' || p_opener_discord_id, 0)
  );

  select ticket.* into v_ticket
    from public.support_tickets as ticket
   where ticket.create_interaction_id = p_interaction_id;
  if found then
    return v_ticket;
  end if;

  select ticket.* into v_ticket
    from public.support_tickets as ticket
   where ticket.support_guild_id = p_support_guild_id
     and ticket.opener_discord_id = p_opener_discord_id
     and ticket.status in (
       'provisioning', 'open', 'in_progress', 'waiting_requester', 'resolved'
     )
   order by ticket.created_at desc
   limit 1;
  if found then
    return v_ticket;
  end if;

  insert into public.support_tickets (
    support_guild_id,
    opener_discord_id,
    opener_name_snapshot,
    opener_locale,
    related_tenant_id,
    related_guild_hint,
    category,
    subject,
    description,
    create_interaction_id
  ) values (
    p_support_guild_id,
    p_opener_discord_id,
    btrim(p_opener_name),
    p_opener_locale,
    p_related_tenant_id,
    nullif(btrim(p_related_guild_hint), ''),
    p_category,
    btrim(p_subject),
    btrim(p_description),
    p_interaction_id
  )
  returning * into v_ticket;

  insert into public.support_ticket_events (
    ticket_id, interaction_id, event_type, actor_kind,
    actor_discord_id, previous_status, new_status
  ) values (
    v_ticket.id, p_interaction_id, 'ticket.reserved', 'requester',
    p_opener_discord_id, null, 'provisioning'
  );

  return v_ticket;
end;
$$;

create or replace function public.finalize_support_ticket(
  p_ticket_id uuid,
  p_thread_id text,
  p_header_message_id text
) returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if p_thread_id !~ '^[0-9]{5,30}$'
     or p_header_message_id !~ '^[0-9]{5,30}$' then
    raise exception 'invalid_discord_resource_id';
  end if;

  update public.support_tickets
     set thread_id = p_thread_id,
         header_message_id = p_header_message_id,
         status = 'open',
         discord_sync_status = 'synced',
         discord_sync_error = null,
         updated_at = now()
   where id = p_ticket_id
     and status in ('provisioning', 'provision_failed')
  returning * into v_ticket;

  if not found then
    select * into v_ticket from public.support_tickets where id = p_ticket_id;
    if not found then raise exception 'support_ticket_not_found'; end if;
    if v_ticket.thread_id is distinct from p_thread_id then
      raise exception 'support_ticket_already_provisioned';
    end if;
    return v_ticket;
  end if;

  insert into public.support_ticket_events (
    ticket_id, event_type, actor_kind, actor_discord_id,
    previous_status, new_status
  ) values (
    v_ticket.id, 'ticket.provisioned', 'system', 'system:support-ticket',
    'provisioning', 'open'
  );
  return v_ticket;
end;
$$;

create or replace function public.mark_support_ticket_provision_failed(
  p_ticket_id uuid,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets
     set status = 'provision_failed',
         discord_sync_status = 'failed',
         discord_sync_attempts = least(discord_sync_attempts + 1, 1000),
         discord_sync_error = left(coalesce(p_error, 'unknown'), 1000),
         updated_at = now()
   where id = p_ticket_id
     and status in ('provisioning', 'provision_failed');
end;
$$;

create or replace function public.transition_support_ticket(
  p_ticket_id uuid,
  p_action text,
  p_actor_discord_id text,
  p_actor_kind text,
  p_interaction_id text
) returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_previous text;
  v_new text;
begin
  if char_length(btrim(coalesce(p_actor_discord_id, ''))) not between 1 and 128
     or p_actor_kind not in ('requester', 'staff', 'system')
     or char_length(btrim(coalesce(p_interaction_id, ''))) not between 1 and 128 then
    raise exception 'invalid_support_ticket_actor';
  end if;

  select ticket.* into v_ticket
    from public.support_tickets as ticket
   where ticket.id = p_ticket_id
   for update;
  if not found then raise exception 'support_ticket_not_found'; end if;

  if exists (
    select 1 from public.support_ticket_events
     where interaction_id = p_interaction_id
  ) then
    return v_ticket;
  end if;

  if p_actor_kind = 'requester'
     and v_ticket.opener_discord_id <> p_actor_discord_id then
    raise exception 'support_ticket_requester_only';
  end if;

  v_previous := v_ticket.status;
  case p_action
    when 'assign' then
      if p_actor_kind <> 'staff' or v_previous not in ('open', 'in_progress', 'waiting_requester', 'resolved') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'in_progress';
      v_ticket.assignee_discord_id := p_actor_discord_id;
      v_ticket.assigned_at := coalesce(v_ticket.assigned_at, now());
    when 'unassign' then
      if p_actor_kind <> 'staff' or v_previous not in ('in_progress', 'waiting_requester', 'resolved') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'open';
      v_ticket.assignee_discord_id := null;
    when 'wait' then
      if p_actor_kind <> 'staff' or v_previous not in ('open', 'in_progress') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'waiting_requester';
      v_ticket.last_reminded_at := null;
    when 'resolve' then
      if p_actor_kind <> 'staff' or v_previous not in ('open', 'in_progress', 'waiting_requester') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'resolved';
      v_ticket.resolved_at := now();
    when 'continue' then
      if p_actor_kind <> 'requester' or v_previous not in ('waiting_requester', 'resolved') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'in_progress';
      v_ticket.resolved_at := null;
      v_ticket.last_reminded_at := null;
    when 'close_requester' then
      if p_actor_kind <> 'requester' or v_previous <> 'resolved' then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'closed';
      v_ticket.closed_at := now();
    when 'close_staff' then
      if p_actor_kind <> 'staff' or v_previous not in ('open', 'in_progress', 'waiting_requester', 'resolved') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'closed';
      v_ticket.closed_at := now();
    when 'close_system' then
      if p_actor_kind <> 'system' or v_previous not in ('waiting_requester', 'resolved') then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'closed';
      v_ticket.closed_at := now();
    when 'reopen' then
      if p_actor_kind <> 'staff' or v_previous <> 'closed' then
        raise exception 'invalid_support_ticket_transition';
      end if;
      v_new := 'in_progress';
      v_ticket.closed_at := null;
      v_ticket.resolved_at := null;
      v_ticket.thread_deleted_at := null;
      v_ticket.assignee_discord_id := p_actor_discord_id;
    else
      raise exception 'unknown_support_ticket_action';
  end case;

  update public.support_tickets
     set status = v_new,
         assignee_discord_id = v_ticket.assignee_discord_id,
         assigned_at = v_ticket.assigned_at,
         resolved_at = v_ticket.resolved_at,
         closed_at = v_ticket.closed_at,
         last_reminded_at = v_ticket.last_reminded_at,
         thread_deleted_at = v_ticket.thread_deleted_at,
         discord_sync_status = 'pending',
         updated_at = now()
   where id = p_ticket_id
  returning * into v_ticket;

  insert into public.support_ticket_events (
    ticket_id, interaction_id, event_type, actor_kind,
    actor_discord_id, previous_status, new_status
  ) values (
    v_ticket.id, p_interaction_id, 'ticket.' || p_action, p_actor_kind,
    p_actor_discord_id, v_previous, v_new
  );

  return v_ticket;
end;
$$;

revoke all on function public.reserve_support_ticket(text, text, text, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_support_ticket(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_support_ticket_provision_failed(uuid, text)
  from public, anon, authenticated;
revoke all on function public.transition_support_ticket(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.reserve_support_ticket(text, text, text, text, uuid, text, text, text, text, text)
  to service_role;
grant execute on function public.finalize_support_ticket(uuid, text, text)
  to service_role;
grant execute on function public.mark_support_ticket_provision_failed(uuid, text)
  to service_role;
grant execute on function public.transition_support_ticket(uuid, text, text, text, text)
  to service_role;

comment on table public.support_tickets is
  'Platform support tickets projected into private Discord threads; service-role only.';
comment on table public.support_ticket_events is
  'Append-only workflow audit for platform support tickets; message content is not copied.';
