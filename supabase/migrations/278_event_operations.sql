-- 278: Immutable event tactics and structured after-action reviews.

-- Composite tenant foreign keys prevent an event id from ever being paired
-- with a different guild, even inside service-role-only operational tables.
create unique index if not exists events_guild_id_id_unique
  on public.events (guild_id, id);

create table if not exists public.event_tactic_snapshots (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  source_board_id uuid not null,
  source_board_updated_at timestamptz not null,
  title text not null,
  summary text not null default '',
  terrain_type text not null,
  visibility text not null,
  tags text[] not null default '{}',
  captured_by text not null,
  captured_at timestamptz not null default now(),
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  foreign key (guild_id, source_board_id)
    references public.tactic_boards(guild_id, id),
  unique (guild_id, id),
  unique (guild_id, event_id),
  constraint event_tactic_snapshots_title_len check (
    length(btrim(title)) > 0 and char_length(title) <= 80
  ),
  constraint event_tactic_snapshots_summary_len check (char_length(summary) <= 300),
  constraint event_tactic_snapshots_terrain_check check (
    terrain_type in ('open-field', 'choke', 'bridge', 'gate', 'castle', 'territory')
  ),
  constraint event_tactic_snapshots_visibility_check check (
    visibility in ('private', 'guild', 'share')
  ),
  constraint event_tactic_snapshots_actor_len check (
    length(btrim(captured_by)) > 0 and char_length(captured_by) <= 128
  )
);

create index if not exists event_tactic_snapshots_event_idx
  on public.event_tactic_snapshots (guild_id, event_id);

create table if not exists public.event_tactic_snapshot_steps (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  snapshot_id uuid not null,
  source_step_id uuid not null,
  step_order integer not null,
  title text not null,
  callout text not null default '',
  role_callouts jsonb not null default '{}'::jsonb,
  phase text not null default 'setup',
  intent text not null default '',
  trigger text not null default '',
  caller_signal text not null default '',
  danger_signs jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  decision_branches jsonb not null default '[]'::jsonb,
  next_step_links jsonb not null default '[]'::jsonb,
  board_state jsonb not null,
  duration_seconds integer not null,
  captured_at timestamptz not null default now(),
  foreign key (guild_id, snapshot_id)
    references public.event_tactic_snapshots(guild_id, id)
    on delete cascade,
  unique (guild_id, snapshot_id, step_order),
  unique (guild_id, snapshot_id, source_step_id),
  constraint event_tactic_snapshot_steps_order_check check (
    step_order >= 0 and step_order < 30
  ),
  constraint event_tactic_snapshot_steps_title_len check (
    length(btrim(title)) > 0 and char_length(title) <= 80
  ),
  constraint event_tactic_snapshot_steps_callout_len check (char_length(callout) <= 500),
  constraint event_tactic_snapshot_steps_role_callouts_object check (
    jsonb_typeof(role_callouts) = 'object'
  ),
  constraint event_tactic_snapshot_steps_phase_check check (
    phase in ('setup', 'pressure', 'bait', 'engage', 'counter', 'reset', 'chase')
  ),
  constraint event_tactic_snapshot_steps_guidance_len check (
    char_length(intent) <= 240
    and char_length(trigger) <= 240
    and char_length(caller_signal) <= 240
  ),
  constraint event_tactic_snapshot_steps_guidance_arrays check (
    jsonb_typeof(danger_signs) = 'array'
    and jsonb_array_length(danger_signs) <= 8
    and octet_length(danger_signs::text) <= 4096
    and jsonb_typeof(common_mistakes) = 'array'
    and jsonb_array_length(common_mistakes) <= 8
    and octet_length(common_mistakes::text) <= 4096
    and jsonb_typeof(decision_branches) = 'array'
    and jsonb_array_length(decision_branches) <= 6
    and octet_length(decision_branches::text) <= 8192
  ),
  constraint event_tactic_snapshot_steps_next_links_array check (
    jsonb_typeof(next_step_links) = 'array'
    and jsonb_array_length(next_step_links) <= 6
    and octet_length(next_step_links::text) <= 4096
  ),
  constraint event_tactic_snapshot_steps_board_state_object check (
    jsonb_typeof(board_state) = 'object'
  ),
  constraint event_tactic_snapshot_steps_board_state_size check (
    octet_length(board_state::text) <= 524288
  ),
  constraint event_tactic_snapshot_steps_duration_check check (
    duration_seconds between 2 and 60
  )
);

create index if not exists event_tactic_snapshot_steps_order_idx
  on public.event_tactic_snapshot_steps (guild_id, snapshot_id, step_order);

create table if not exists public.event_after_action_reviews (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  summary text not null default '',
  wins jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, event_id)
    references public.events(guild_id, id)
    on delete cascade,
  unique (guild_id, event_id),
  constraint event_after_action_reviews_summary_len check (char_length(summary) <= 1000),
  constraint event_after_action_reviews_actor_len check (
    length(btrim(updated_by)) > 0 and char_length(updated_by) <= 128
  ),
  constraint event_after_action_reviews_wins_array check (
    jsonb_typeof(wins) = 'array'
    and jsonb_array_length(wins) <= 8
    and octet_length(wins::text) <= 4096
  ),
  constraint event_after_action_reviews_issues_array check (
    jsonb_typeof(issues) = 'array'
    and jsonb_array_length(issues) <= 8
    and octet_length(issues::text) <= 4096
  ),
  constraint event_after_action_reviews_action_items_array check (
    jsonb_typeof(action_items) = 'array'
    and jsonb_array_length(action_items) <= 8
    and octet_length(action_items::text) <= 4096
  )
);

create index if not exists event_after_action_reviews_event_idx
  on public.event_after_action_reviews (guild_id, event_id);

alter table public.event_tactic_snapshots enable row level security;
alter table public.event_tactic_snapshot_steps enable row level security;
alter table public.event_after_action_reviews enable row level security;

grant select, insert, delete on public.event_tactic_snapshots to service_role;
grant select, insert, delete on public.event_tactic_snapshot_steps to service_role;
grant select, insert, update, delete on public.event_after_action_reviews to service_role;

create or replace function public.capture_event_tactic_snapshot(
  p_guild_id uuid,
  p_event_id uuid,
  p_board_id uuid,
  p_actor text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_battle_started_at timestamptz;
  v_event_category text;
  v_board jsonb;
  v_steps jsonb;
  v_snapshot_id uuid;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 or char_length(p_actor) > 128 then
    raise exception 'event_tactic_actor_invalid';
  end if;

  select e.battle_started_at, e.category
    into v_battle_started_at, v_event_category
  from public.events as e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'event_not_found';
  end if;

  if v_battle_started_at is not null then
    raise exception 'event_tactic_snapshot_locked';
  end if;

  if v_event_category is distinct from '전투' then
    raise exception 'event_tactic_not_combat';
  end if;

  -- Header and steps are read by one SQL statement, so the snapshot cannot
  -- mix two source revisions even when another editor saves concurrently.
  select
    to_jsonb(b),
    coalesce(
      jsonb_agg(to_jsonb(step) order by step.step_order)
        filter (where step.id is not null),
      '[]'::jsonb
    )
    into v_board, v_steps
  from public.tactic_boards as b
  left join public.tactic_steps as step
    on step.guild_id = b.guild_id
   and step.board_id = b.id
  where b.guild_id = p_guild_id
    and b.id = p_board_id
    and b.status = 'published'
  group by b.id;

  if not found then
    raise exception 'published_tactic_not_found';
  end if;

  if jsonb_array_length(v_steps) < 1 then
    raise exception 'published_tactic_has_no_steps';
  end if;

  delete from public.event_tactic_snapshots
  where guild_id = p_guild_id
    and event_id = p_event_id;

  insert into public.event_tactic_snapshots (
    guild_id,
    event_id,
    source_board_id,
    source_board_updated_at,
    title,
    summary,
    terrain_type,
    visibility,
    tags,
    captured_by
  ) values (
    p_guild_id,
    p_event_id,
    p_board_id,
    (v_board ->> 'updated_at')::timestamptz,
    v_board ->> 'title',
    coalesce(v_board ->> 'summary', ''),
    v_board ->> 'terrain_type',
    v_board ->> 'visibility',
    coalesce(
      array(select jsonb_array_elements_text(v_board -> 'tags')),
      '{}'::text[]
    ),
    btrim(p_actor)
  )
  returning id into v_snapshot_id;

  insert into public.event_tactic_snapshot_steps (
    guild_id,
    snapshot_id,
    source_step_id,
    step_order,
    title,
    callout,
    role_callouts,
    phase,
    intent,
    trigger,
    caller_signal,
    danger_signs,
    common_mistakes,
    decision_branches,
    next_step_links,
    board_state,
    duration_seconds
  )
  select
    step.guild_id,
    v_snapshot_id,
    step.id,
    step.step_order,
    step.title,
    step.callout,
    step.role_callouts,
    step.phase,
    step.intent,
    step.trigger,
    step.caller_signal,
    step.danger_signs,
    step.common_mistakes,
    step.decision_branches,
    step.next_step_links,
    step.board_state,
    step.duration_seconds
  from jsonb_populate_recordset(null::public.tactic_steps, v_steps) as step
  order by step.step_order;

  return v_snapshot_id;
end;
$$;

revoke all on function public.capture_event_tactic_snapshot(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.capture_event_tactic_snapshot(
  uuid, uuid, uuid, text
) to service_role;

create or replace function public.clear_event_tactic_snapshot(
  p_guild_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_battle_started_at timestamptz;
begin
  select e.battle_started_at
    into v_battle_started_at
  from public.events as e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'event_not_found';
  end if;

  if v_battle_started_at is not null then
    raise exception 'event_tactic_snapshot_locked';
  end if;

  delete from public.event_tactic_snapshots
  where guild_id = p_guild_id
    and event_id = p_event_id;
end;
$$;

revoke all on function public.clear_event_tactic_snapshot(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.clear_event_tactic_snapshot(
  uuid, uuid
) to service_role;

comment on table public.event_tactic_snapshots is
  'Immutable event-scoped copy of the published tactic selected before battle start.';
comment on table public.event_after_action_reviews is
  'Structured guild-scoped event review with bounded wins, issues, and follow-up actions.';
comment on function public.capture_event_tactic_snapshot(uuid, uuid, uuid, text) is
  'Atomically replaces a pre-battle event tactic with a same-guild published board snapshot.';
comment on function public.clear_event_tactic_snapshot(uuid, uuid) is
  'Atomically removes a pre-battle event tactic snapshot within one guild.';
