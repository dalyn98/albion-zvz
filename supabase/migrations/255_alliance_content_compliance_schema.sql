-- 255: Menhera alliance-content compliance ledger.
--
-- Alliance content is not a site event. Several ZvZ battle records can be
-- produced by one outing, so officers confirm a post-hoc session from the
-- already-classified ZvZ ledger. A confirmed session is then the sole unit of
-- participation, weekly rate, and the "three sessions → one video" duty.

create table if not exists public.alliance_content_policies (
  guild_id uuid primary key references public.tenants(id) on delete cascade,
  session_gap_minutes integer not null default 90 check (session_gap_minutes between 15 and 240),
  weekly_min_sessions integer not null default 3 check (weekly_min_sessions between 0 and 20),
  weekly_min_participation_rate integer not null default 0 check (weekly_min_participation_rate between 0 and 100),
  video_every_sessions integer not null default 3 check (video_every_sessions = 3),
  video_due_days integer not null default 7 check (video_due_days = 7),
  updated_at timestamptz not null default now()
);

create table if not exists public.alliance_content_sessions (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  is_counted boolean not null default true,
  confirmed_by_discord_id text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (ended_at >= started_at),
  unique (guild_id, id)
);

create index if not exists idx_alliance_content_sessions_guild_ended
  on public.alliance_content_sessions (guild_id, ended_at desc);

create table if not exists public.alliance_content_session_battles (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guild_id, battle_record_id),
  unique (guild_id, session_id, battle_record_id),
  foreign key (guild_id, session_id)
    references public.alliance_content_sessions(guild_id, id) on delete cascade
);

create index if not exists idx_alliance_content_session_battles_session
  on public.alliance_content_session_battles (guild_id, session_id);

create table if not exists public.alliance_content_excluded_battles (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  excluded_by_discord_id text not null,
  excluded_at timestamptz not null default now(),
  primary key (guild_id, battle_record_id)
);

create table if not exists public.alliance_content_participations (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  discord_id text not null,
  albion_player_id text not null,
  source text not null default 'battlelog' check (source in ('battlelog', 'admin_override', 'approved_regear')),
  created_at timestamptz not null default now(),
  unique (guild_id, id),
  unique (guild_id, session_id, discord_id),
  foreign key (guild_id, session_id)
    references public.alliance_content_sessions(guild_id, id) on delete cascade
);

create index if not exists idx_alliance_content_participations_member
  on public.alliance_content_participations (guild_id, discord_id, session_id);

create table if not exists public.alliance_content_video_requirements (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  due_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'approved', 'overdue', 'waived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, id)
);

create index if not exists idx_alliance_content_video_requirements_member
  on public.alliance_content_video_requirements (guild_id, discord_id, status, due_at);

create table if not exists public.alliance_content_video_requirement_sessions (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (guild_id, requirement_id, session_id),
  unique (guild_id, session_id),
  foreign key (guild_id, requirement_id)
    references public.alliance_content_video_requirements(guild_id, id) on delete cascade,
  foreign key (guild_id, session_id)
    references public.alliance_content_sessions(guild_id, id) on delete cascade
);

create table if not exists public.alliance_content_video_submissions (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null,
  session_id uuid not null,
  discord_id text not null,
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_url text not null check (video_url ~ '^https://www\.youtube\.com/embed/[A-Za-z0-9_-]{11}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_discord_id text,
  review_note text,
  unique (guild_id, id),
  unique (guild_id, youtube_video_id),
  foreign key (guild_id, requirement_id)
    references public.alliance_content_video_requirements(guild_id, id) on delete cascade,
  foreign key (guild_id, session_id)
    references public.alliance_content_sessions(guild_id, id) on delete cascade
);

create unique index if not exists idx_alliance_content_video_submissions_active_requirement
  on public.alliance_content_video_submissions (guild_id, requirement_id)
  where status in ('pending', 'approved');

create index if not exists idx_alliance_content_video_submissions_review
  on public.alliance_content_video_submissions (guild_id, status, submitted_at);

alter table public.alliance_content_policies enable row level security;
alter table public.alliance_content_sessions enable row level security;
alter table public.alliance_content_session_battles enable row level security;
alter table public.alliance_content_excluded_battles enable row level security;
alter table public.alliance_content_participations enable row level security;
alter table public.alliance_content_video_requirements enable row level security;
alter table public.alliance_content_video_requirement_sessions enable row level security;
alter table public.alliance_content_video_submissions enable row level security;

revoke all on public.alliance_content_policies from anon, authenticated;
revoke all on public.alliance_content_sessions from anon, authenticated;
revoke all on public.alliance_content_session_battles from anon, authenticated;
revoke all on public.alliance_content_excluded_battles from anon, authenticated;
revoke all on public.alliance_content_participations from anon, authenticated;
revoke all on public.alliance_content_video_requirements from anon, authenticated;
revoke all on public.alliance_content_video_requirement_sessions from anon, authenticated;
revoke all on public.alliance_content_video_submissions from anon, authenticated;

create or replace function public.alliance_content_compliance_enabled(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    inner join public.app_settings s
      on s.guild_id = t.id
     and s.key = 'alliance_content_compliance_enabled'
     and s.value = 'true'
    where t.id = p_guild_id
      and t.slug = 'menhera'
  );
$$;

create or replace function public.refresh_alliance_content_video_requirements(
  p_guild_id uuid,
  p_discord_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.alliance_content_policies%rowtype;
  v_batch record;
  v_requirement_id uuid;
  v_created integer := 0;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_discord_id, 0));

  select *
    into v_policy
    from public.alliance_content_policies
   where guild_id = p_guild_id;

  if not found then
    raise exception 'ALLIANCE_CONTENT_POLICY_NOT_FOUND';
  end if;

  for v_batch in
    with unassigned as (
      select
        p.session_id,
        s.ended_at,
        row_number() over (order by s.ended_at asc, p.session_id asc) as ordinal
      from public.alliance_content_participations p
      inner join public.alliance_content_sessions s
        on s.guild_id = p.guild_id
       and s.id = p.session_id
       and s.is_counted
      where p.guild_id = p_guild_id
        and p.discord_id = p_discord_id
        and not exists (
          select 1
          from public.alliance_content_video_requirement_sessions rs
          inner join public.alliance_content_video_requirements r
            on r.guild_id = rs.guild_id
           and r.id = rs.requirement_id
          where rs.guild_id = p.guild_id
            and rs.session_id = p.session_id
            and r.discord_id = p_discord_id
        )
    ), grouped as (
      select
        floor((ordinal - 1) / v_policy.video_every_sessions)::integer as batch_number,
        array_agg(session_id order by ended_at asc, session_id asc) as session_ids,
        max(ended_at) as completed_at,
        count(*) as session_count
      from unassigned
      group by floor((ordinal - 1) / v_policy.video_every_sessions)
    )
    select session_ids, completed_at
    from grouped
    where session_count = v_policy.video_every_sessions
    order by batch_number asc
  loop
    insert into public.alliance_content_video_requirements (
      guild_id,
      discord_id,
      due_at
    ) values (
      p_guild_id,
      p_discord_id,
      v_batch.completed_at + make_interval(days => v_policy.video_due_days)
    )
    returning id into v_requirement_id;

    insert into public.alliance_content_video_requirement_sessions (
      guild_id,
      requirement_id,
      session_id
    )
    select p_guild_id, v_requirement_id, session_id
    from unnest(v_batch.session_ids) as session_id;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

create or replace function public.confirm_alliance_content_session(
  p_guild_id uuid,
  p_battle_record_ids uuid[],
  p_admin_discord_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_requested_count integer;
  v_selected_count integer;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_member record;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  if coalesce(cardinality(p_battle_record_ids), 0) = 0 then
    raise exception 'ALLIANCE_CONTENT_BATTLES_REQUIRED';
  end if;

  select count(*) into v_requested_count
  from unnest(p_battle_record_ids) as input_battle(battle_record_id);
  select count(distinct battle_record_id) into v_selected_count
  from unnest(p_battle_record_ids) as input_battle(battle_record_id);
  if v_requested_count <> v_selected_count then
    raise exception 'ALLIANCE_CONTENT_DUPLICATE_BATTLE';
  end if;

  with selected as (
    select distinct
      tbr.battle_record_id,
      br.started_at,
      br.ended_at
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and tbr.battle_record_id = any(p_battle_record_ids)
      and br.ended_at is not null
  )
  select count(*), min(started_at), max(ended_at)
    into v_selected_count, v_started_at, v_ended_at
  from selected;

  if v_selected_count <> v_requested_count then
    raise exception 'ALLIANCE_CONTENT_BATTLE_NOT_ELIGIBLE';
  end if;

  if exists (
    select 1
    from public.alliance_content_session_battles sb
    where sb.guild_id = p_guild_id
      and sb.battle_record_id = any(p_battle_record_ids)
  ) then
    raise exception 'ALLIANCE_CONTENT_BATTLE_ALREADY_ASSIGNED';
  end if;

  if exists (
    select 1
    from public.alliance_content_excluded_battles eb
    where eb.guild_id = p_guild_id
      and eb.battle_record_id = any(p_battle_record_ids)
  ) then
    raise exception 'ALLIANCE_CONTENT_BATTLE_EXCLUDED';
  end if;

  insert into public.alliance_content_sessions (
    guild_id,
    started_at,
    ended_at,
    confirmed_by_discord_id
  ) values (
    p_guild_id,
    v_started_at,
    v_ended_at,
    p_admin_discord_id
  )
  returning id into v_session_id;

  insert into public.alliance_content_session_battles (
    guild_id,
    session_id,
    battle_record_id
  )
  select p_guild_id, v_session_id, battle_record_id
  from unnest(p_battle_record_ids) as input_battle(battle_record_id);

  with selected_battles as (
    select distinct
      tbr.battle_record_id,
      br.raw_battle
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and tbr.battle_record_id = any(p_battle_record_ids)
  ), projected_participations as (
    select distinct
      ga.discord_id,
      ga.albion_player_id
    from selected_battles sb
    inner join public.battle_participant_snapshots bps
      on bps.battle_record_id = sb.battle_record_id
     and bps.participant_type = 'player'
    inner join public.albion_guild_members agm
      on agm.guild_id = p_guild_id
     and agm.albion_player_id = bps.entity_albion_id
     and agm.left_at is null
    inner join public.guild_avatars ga
      on ga.guild_id = p_guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
  ), raw_participations as (
    select distinct
      ga.discord_id,
      ga.albion_player_id
    from selected_battles sb
    cross join lateral jsonb_each(coalesce(sb.raw_battle -> 'players', '{}'::jsonb)) player
    inner join public.albion_guild_members agm
      on agm.guild_id = p_guild_id
     and agm.albion_player_id = player.value ->> 'id'
     and agm.left_at is null
    inner join public.guild_avatars ga
      on ga.guild_id = p_guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
    where not exists (
      select 1
      from public.battle_participant_snapshots bps
      where bps.battle_record_id = sb.battle_record_id
        and bps.participant_type = 'player'
    )
  ), participants as (
    select * from projected_participations
    union
    select * from raw_participations
  )
  insert into public.alliance_content_participations (
    guild_id,
    session_id,
    discord_id,
    albion_player_id
  )
  select p_guild_id, v_session_id, discord_id, albion_player_id
  from participants
  on conflict (guild_id, session_id, discord_id) do nothing;

  for v_member in
    select distinct discord_id
    from public.alliance_content_participations
    where guild_id = p_guild_id
      and session_id = v_session_id
  loop
    perform public.refresh_alliance_content_video_requirements(p_guild_id, v_member.discord_id);
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.submit_alliance_content_video(
  p_guild_id uuid,
  p_requirement_id uuid,
  p_session_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.alliance_content_video_requirements%rowtype;
  v_submission_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  if p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
     or p_video_url !~ '^https://www\.youtube\.com/embed/[A-Za-z0-9_-]{11}$' then
    raise exception 'ALLIANCE_CONTENT_INVALID_VIDEO';
  end if;

  select *
    into v_requirement
    from public.alliance_content_video_requirements
   where id = p_requirement_id
     and guild_id = p_guild_id
     and discord_id = p_discord_id
   for update;

  if not found then
    raise exception 'ALLIANCE_CONTENT_REQUIREMENT_NOT_FOUND';
  end if;

  if v_requirement.status not in ('open', 'overdue') or v_requirement.due_at < now() then
    raise exception 'ALLIANCE_CONTENT_VIDEO_DEADLINE_PASSED';
  end if;

  if not exists (
    select 1
    from public.alliance_content_video_requirement_sessions rs
    where rs.guild_id = p_guild_id
      and rs.requirement_id = p_requirement_id
      and rs.session_id = p_session_id
  ) then
    raise exception 'ALLIANCE_CONTENT_SESSION_NOT_IN_REQUIREMENT';
  end if;

  insert into public.alliance_content_video_submissions (
    guild_id,
    requirement_id,
    session_id,
    discord_id,
    youtube_video_id,
    video_url
  ) values (
    p_guild_id,
    p_requirement_id,
    p_session_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url
  )
  returning id into v_submission_id;

  update public.alliance_content_video_requirements
     set status = 'submitted',
         updated_at = now()
   where guild_id = p_guild_id
     and id = p_requirement_id;

  return v_submission_id;
end;
$$;

create or replace function public.review_alliance_content_video(
  p_guild_id uuid,
  p_submission_id uuid,
  p_admin_discord_id text,
  p_decision text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.alliance_content_video_submissions%rowtype;
  v_requirement public.alliance_content_video_requirements%rowtype;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'ALLIANCE_CONTENT_INVALID_REVIEW_DECISION';
  end if;

  select *
    into v_submission
    from public.alliance_content_video_submissions
   where id = p_submission_id
     and guild_id = p_guild_id
   for update;

  if not found or v_submission.status <> 'pending' then
    raise exception 'ALLIANCE_CONTENT_SUBMISSION_NOT_REVIEWABLE';
  end if;

  select *
    into v_requirement
    from public.alliance_content_video_requirements
   where id = v_submission.requirement_id
     and guild_id = p_guild_id
   for update;

  update public.alliance_content_video_submissions
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_at = now(),
         reviewed_by_discord_id = p_admin_discord_id,
         review_note = nullif(left(coalesce(p_review_note, ''), 500), '')
   where id = v_submission.id
     and guild_id = p_guild_id;

  update public.alliance_content_video_requirements
     set status = case
           when p_decision = 'approve' then 'approved'
           when due_at < now() then 'overdue'
           else 'open'
         end,
         updated_at = now()
   where id = v_requirement.id
     and guild_id = p_guild_id;

  return v_submission.id;
end;
$$;

revoke all on function public.alliance_content_compliance_enabled(uuid) from public;
revoke all on function public.refresh_alliance_content_video_requirements(uuid, text) from public;
revoke all on function public.confirm_alliance_content_session(uuid, uuid[], text) from public;
revoke all on function public.submit_alliance_content_video(uuid, uuid, uuid, text, text, text) from public;
revoke all on function public.review_alliance_content_video(uuid, uuid, text, text, text) from public;

revoke all on function public.alliance_content_compliance_enabled(uuid) from anon, authenticated;
revoke all on function public.refresh_alliance_content_video_requirements(uuid, text) from anon, authenticated;
revoke all on function public.confirm_alliance_content_session(uuid, uuid[], text) from anon, authenticated;
revoke all on function public.submit_alliance_content_video(uuid, uuid, uuid, text, text, text) from anon, authenticated;
revoke all on function public.review_alliance_content_video(uuid, uuid, text, text, text) from anon, authenticated;

grant execute on function public.alliance_content_compliance_enabled(uuid) to service_role;
grant execute on function public.refresh_alliance_content_video_requirements(uuid, text) to service_role;
grant execute on function public.confirm_alliance_content_session(uuid, uuid[], text) to service_role;
grant execute on function public.submit_alliance_content_video(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.review_alliance_content_video(uuid, uuid, text, text, text) to service_role;

comment on table public.alliance_content_sessions is
  'Officer-confirmed post-hoc alliance content sessions. One session may group several separate Albion battle logs.';
comment on table public.alliance_content_video_requirements is
  'One required video for exactly three confirmed content sessions of one member. Due seven days after the third session.';
comment on table public.alliance_content_video_submissions is
  'Canonical YouTube ID is unique per tenant, preventing one source video from fulfilling multiple duties.';
