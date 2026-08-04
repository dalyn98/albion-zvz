-- AGM Battles v2: tenant-neutral engagement evidence and separate guild/alliance rankings.
--
-- Raw Albion battle ids remain source containers. Only complete, finalized
-- engagement projections qualify for ranking evidence. Alliance credit is
-- recorded once; directly observed guilds receive the unredistributed share
-- represented by their observed deployment.

create table public.public_zvz_engagements (
  id uuid primary key default gen_random_uuid(),
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  engagement_key text not null check (engagement_key ~ '^[a-f0-9]{64}$'),
  sequence integer not null check (sequence >= 1),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  status text not null check (status in (
    'final',
    'partial_source',
    'segmentation_required',
    'below_official_size',
    'low_engagement',
    'insufficient_evidence'
  )),
  coverage text not null check (coverage in ('complete', 'partial', 'unavailable')),
  result text check (result is null or result in ('advantage', 'disadvantage', 'even')),
  home_force_key text not null,
  home_force_kind text not null check (home_force_kind in ('alliance', 'guild')),
  home_force_albion_id text not null,
  home_force_name text not null,
  home_alliance_id text,
  home_alliance_name text,
  home_side_team_size integer not null check (home_side_team_size >= 1),
  opponent_side_team_size integer not null check (opponent_side_team_size >= 0),
  scale text not null check (scale in ('small', 'mid', 'large', 'zerg')),
  home_kills integer not null check (home_kills >= 0),
  home_deaths integer not null check (home_deaths >= 0),
  home_kill_fame bigint not null check (home_kill_fame >= 0),
  opponent_kill_fame bigint not null check (opponent_kill_fame >= 0),
  result_event_count integer not null check (result_event_count >= 0),
  intervention_event_count integer not null check (intervention_event_count >= 0),
  event_ids text[] not null default '{}',
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  qualification_version text not null default 'agm_zvz_v2',
  projected_at timestamptz not null default now(),
  unique (battle_record_id, home_force_key, engagement_key),
  check (status <> 'final' or (coverage = 'complete' and result is not null)),
  check (status <> 'final' or (
    home_side_team_size >= 20 and opponent_side_team_size >= 20
  ))
);

create index idx_public_zvz_engagements_period
  on public.public_zvz_engagements (albion_server, started_at desc)
  where status = 'final';

create index idx_public_zvz_engagements_battle
  on public.public_zvz_engagements (battle_record_id, home_force_key);

alter table public.public_zvz_engagements enable row level security;
revoke all on public.public_zvz_engagements from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_engagements to service_role;

comment on table public.public_zvz_engagements is
  'Tenant-neutral actual-fight projections derived from complete Albion kill events. Raw battles may yield multiple engagements and force perspectives.';

create table public.public_zvz_battle_projection_runs (
  battle_record_id uuid primary key references public.battle_records(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  coverage text not null check (coverage in ('complete', 'partial', 'unavailable')),
  is_candidate boolean not null,
  observed_event_count integer not null check (observed_event_count >= 0),
  expected_event_count integer not null check (expected_event_count >= 0),
  engagement_count integer not null check (engagement_count >= 0),
  projected_at timestamptz not null default now()
);

create index idx_public_zvz_projection_runs_retry
  on public.public_zvz_battle_projection_runs (coverage, projected_at)
  where coverage <> 'complete';

alter table public.public_zvz_battle_projection_runs enable row level security;
revoke all on public.public_zvz_battle_projection_runs from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_battle_projection_runs to service_role;

comment on table public.public_zvz_battle_projection_runs is
  'Projection checkpoint including non-candidate and zero-engagement battles, so incremental backfill does not rescan completed source rows.';

create or replace function public.list_public_zvz_projection_backfill_candidates(
  p_limit integer default 25
)
returns table (
  battle_record_id uuid,
  albion_server text,
  raw_battle jsonb,
  engagement_source_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_seasons as (
    select distinct on (season.albion_server)
      season.albion_server,
      season.starts_on
    from public.zvz_seasons season
    where season.starts_on <= (clock_timestamp() at time zone 'UTC')::date
    order by season.albion_server, season.starts_on desc
  )
  select
    battle.id,
    battle.albion_server,
    battle.raw_battle,
    battle.engagement_source_hash
  from current_seasons season
  join public.battle_records battle
    on battle.albion_server = season.albion_server
   and battle.started_at >= season.starts_on::timestamptz
  left join public.public_zvz_battle_projection_runs run
    on run.battle_record_id = battle.id
  where run.battle_record_id is null
     or run.source_hash is distinct from battle.engagement_source_hash
     or run.coverage <> 'complete'
  order by battle.started_at asc, battle.id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;

create table public.public_zvz_engagement_matchups (
  engagement_id uuid not null references public.public_zvz_engagements(id) on delete cascade,
  opponent_force_key text not null,
  opponent_force_kind text not null check (opponent_force_kind in ('alliance', 'guild')),
  opponent_albion_id text not null,
  opponent_name text not null,
  opponent_alliance_id text,
  opponent_team_size integer not null check (opponent_team_size >= 0),
  role text not null check (role in ('result_eligible', 'intervention')),
  event_count integer not null check (event_count >= 1),
  home_kills integer not null check (home_kills >= 0),
  home_deaths integer not null check (home_deaths >= 0),
  home_kill_fame bigint not null check (home_kill_fame >= 0),
  opponent_kill_fame bigint not null check (opponent_kill_fame >= 0),
  primary key (engagement_id, opponent_force_key)
);

create index idx_public_zvz_engagement_matchups_opponent
  on public.public_zvz_engagement_matchups (opponent_force_kind, opponent_albion_id);

alter table public.public_zvz_engagement_matchups enable row level security;
revoke all on public.public_zvz_engagement_matchups from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_engagement_matchups to service_role;

comment on table public.public_zvz_engagement_matchups is
  'Explicit opponent forces inside one engagement. One-event interventions remain visible but do not qualify the result or opponent-side size.';

create table public.public_zvz_entity_engagement_evidence (
  engagement_id uuid not null references public.public_zvz_engagements(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('guild', 'alliance')),
  entity_albion_id text not null,
  entity_name text not null,
  alliance_albion_id text,
  alliance_name text,
  own_team_size integer not null check (own_team_size >= 1),
  side_team_size integer not null check (side_team_size >= own_team_size),
  participation_share numeric(12, 8) not null
    check (participation_share > 0 and participation_share <= 1),
  battle_credit numeric(12, 8) not null
    check (battle_credit > 0 and battle_credit <= 1),
  battle_points numeric(18, 8) not null check (battle_points > 0),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  participation_kind text not null check (participation_kind in (
    'standalone', 'single_guild_sortie', 'joint_sortie'
  )),
  primary key (engagement_id, entity_kind, entity_albion_id),
  check (abs(battle_points - battle_credit * 25) < 0.000001),
  check (entity_kind <> 'alliance' or participation_share = 1),
  check (entity_kind <> 'alliance' or battle_credit = 1)
);

create index idx_public_zvz_entity_engagement_lookup
  on public.public_zvz_entity_engagement_evidence (
    entity_kind,
    entity_albion_id,
    engagement_id
  );

alter table public.public_zvz_entity_engagement_evidence enable row level security;
revoke all on public.public_zvz_entity_engagement_evidence from anon, authenticated;
grant select, insert, update, delete
  on public.public_zvz_entity_engagement_evidence
  to service_role;

comment on table public.public_zvz_entity_engagement_evidence is
  'One alliance row plus directly observed guild rows for a finalized engagement. Guild credit is proportional and any unobserved share is not reassigned.';

create table public.public_zvz_v2_season_snapshots (
  season_id uuid not null references public.zvz_seasons(id) on delete cascade,
  snapshot_date date not null,
  data_through_at timestamptz not null,
  is_final boolean not null default false,
  guild_count integer not null default 0 check (guild_count >= 0),
  alliance_count integer not null default 0 check (alliance_count >= 0),
  refreshed_at timestamptz not null default now(),
  primary key (season_id, snapshot_date)
);

create index idx_public_zvz_v2_snapshots_history
  on public.public_zvz_v2_season_snapshots (season_id, snapshot_date desc);

alter table public.public_zvz_v2_season_snapshots enable row level security;
revoke all on public.public_zvz_v2_season_snapshots from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_v2_season_snapshots to service_role;

comment on table public.public_zvz_v2_season_snapshots is
  'Independent v2 daily publication checkpoints. Recent 48 hours are provisional; finalized dates change only with an explicit forced rebuild.';

create table public.public_zvz_v2_season_evidence (
  season_id uuid not null,
  evidence_date date not null,
  engagement_id uuid not null,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  battle_started_at timestamptz not null,
  battle_ended_at timestamptz not null,
  engagement_key text not null,
  result text not null check (result in ('advantage', 'disadvantage', 'even')),
  scale text not null check (scale in ('small', 'mid', 'large', 'zerg')),
  entity_kind text not null check (entity_kind in ('guild', 'alliance')),
  entity_albion_id text not null,
  entity_name text not null,
  alliance_albion_id text,
  alliance_name text,
  own_team_size integer not null check (own_team_size >= 1),
  side_team_size integer not null check (side_team_size >= own_team_size),
  opponent_side_team_size integer not null check (opponent_side_team_size >= 20),
  participation_share numeric(12, 8) not null,
  battle_credit numeric(12, 8) not null,
  battle_points numeric(18, 8) not null,
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  participation_kind text not null,
  opponents jsonb not null default '[]'::jsonb check (jsonb_typeof(opponents) = 'array'),
  qualification_version text not null,
  frozen_at timestamptz not null default now(),
  primary key (
    season_id,
    evidence_date,
    engagement_id,
    entity_kind,
    entity_albion_id
  ),
  foreign key (season_id, evidence_date)
    references public.public_zvz_v2_season_snapshots(season_id, snapshot_date)
    on delete cascade
);

create index idx_public_zvz_v2_evidence_entity
  on public.public_zvz_v2_season_evidence (
    season_id,
    entity_kind,
    entity_albion_id,
    evidence_date desc,
    battle_started_at desc
  );

create index idx_public_zvz_v2_evidence_scale
  on public.public_zvz_v2_season_evidence (
    season_id,
    evidence_date,
    entity_kind,
    scale
  );

alter table public.public_zvz_v2_season_evidence enable row level security;
revoke all on public.public_zvz_v2_season_evidence from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_v2_season_evidence to service_role;

comment on table public.public_zvz_v2_season_evidence is
  'Season-day frozen copies of engagement evidence and opponent context, preventing historical ranks and record pages from diverging.';

create table public.public_zvz_v2_season_rollups (
  season_id uuid not null,
  snapshot_date date not null,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  entity_kind text not null check (entity_kind in ('guild', 'alliance')),
  entity_albion_id text not null,
  entity_name text not null,
  alliance_albion_id text,
  alliance_name text,
  tenant_id uuid references public.tenants(id) on delete set null,
  tenant_slug text,
  tenant_profile_enabled boolean not null default false,
  scope text not null check (scope in ('overall', 'small', 'mid', 'large', 'zerg')),
  engagement_count integer not null check (engagement_count >= 1),
  equivalent_battles numeric(18, 8) not null check (equivalent_battles > 0),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  representative_size numeric(10, 2) not null check (representative_size >= 0),
  average_size numeric(10, 2) not null check (average_size >= 0),
  max_size integer not null check (max_size >= 0),
  combat_index numeric(18, 6) not null check (combat_index >= 0),
  battle_points numeric(18, 6) not null check (battle_points >= 0),
  size_points numeric(18, 6) not null check (size_points between 0 and 500),
  combat_points numeric(18, 6) not null check (combat_points between 0 and 700),
  activity_points numeric(18, 6) not null check (activity_points between 0 and 300),
  score numeric(18, 2) not null check (score between 0 and 1000),
  rank integer not null check (rank >= 1),
  sample_status text not null check (sample_status in ('ranked', 'insufficient_sample')),
  latest_battle_at timestamptz not null,
  score_formula_version text not null default 'agm_zvz_v2'
    check (score_formula_version = 'agm_zvz_v2'),
  updated_at timestamptz not null default now(),
  primary key (
    season_id,
    snapshot_date,
    entity_kind,
    entity_albion_id,
    scope
  ),
  foreign key (season_id, snapshot_date)
    references public.public_zvz_v2_season_snapshots(season_id, snapshot_date)
    on delete cascade
);

create index idx_public_zvz_v2_rollups_rank
  on public.public_zvz_v2_season_rollups (
    season_id,
    snapshot_date desc,
    entity_kind,
    scope,
    sample_status,
    rank
  );

create index idx_public_zvz_v2_rollups_entity_history
  on public.public_zvz_v2_season_rollups (
    albion_server,
    entity_kind,
    entity_albion_id,
    season_id,
    snapshot_date desc
  );

alter table public.public_zvz_v2_season_rollups enable row level security;
revoke all on public.public_zvz_v2_season_rollups from anon, authenticated;
grant select, insert, update, delete on public.public_zvz_v2_season_rollups to service_role;

comment on table public.public_zvz_v2_season_rollups is
  'Separate guild/alliance season rankings. Overall and each encounter scale are independently recomputed from frozen engagement evidence.';

create or replace function public.replace_public_zvz_battle_projection(
  p_battle_record_id uuid,
  p_source_hash text,
  p_coverage text,
  p_is_candidate boolean,
  p_observed_event_count integer,
  p_expected_event_count integer,
  p_engagements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_hash text;
  v_engagement jsonb;
  v_matchup jsonb;
  v_evidence jsonb;
  v_engagement_id uuid;
  v_engagement_count integer := 0;
  v_evidence_count integer := 0;
begin
  if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid projection source hash';
  end if;
  if p_coverage not in ('complete', 'partial', 'unavailable') then
    raise exception 'invalid projection coverage';
  end if;
  if jsonb_typeof(p_engagements) <> 'array' then
    raise exception 'engagement projection must be an array';
  end if;
  if p_observed_event_count < 0 or p_expected_event_count < 0 then
    raise exception 'projection event counts must be non-negative';
  end if;

  select engagement_source_hash
    into v_stored_hash
    from public.battle_records
   where id = p_battle_record_id
   for update;

  if not found then
    raise exception 'battle record not found';
  end if;
  if v_stored_hash is not null and v_stored_hash <> p_source_hash then
    raise exception 'stale battle projection source';
  end if;

  update public.battle_records
     set engagement_source_hash = p_source_hash
   where id = p_battle_record_id
     and engagement_source_hash is null;

  delete from public.public_zvz_engagements
   where battle_record_id = p_battle_record_id;

  for v_engagement in
    select value from jsonb_array_elements(p_engagements)
  loop
    insert into public.public_zvz_engagements (
      battle_record_id,
      albion_server,
      engagement_key,
      sequence,
      started_at,
      ended_at,
      status,
      coverage,
      result,
      home_force_key,
      home_force_kind,
      home_force_albion_id,
      home_force_name,
      home_alliance_id,
      home_alliance_name,
      home_side_team_size,
      opponent_side_team_size,
      scale,
      home_kills,
      home_deaths,
      home_kill_fame,
      opponent_kill_fame,
      result_event_count,
      intervention_event_count,
      event_ids,
      source_hash,
      qualification_version,
      projected_at
    )
    select
      p_battle_record_id,
      br.albion_server,
      v_engagement->>'engagementKey',
      (v_engagement->>'sequence')::integer,
      (v_engagement->>'startedAt')::timestamptz,
      (v_engagement->>'endedAt')::timestamptz,
      v_engagement->>'status',
      p_coverage,
      nullif(v_engagement->>'result', ''),
      v_engagement->>'homeForceKey',
      v_engagement->>'homeForceKind',
      v_engagement->>'homeForceAlbionId',
      v_engagement->>'homeForceName',
      nullif(v_engagement->>'homeAllianceId', ''),
      nullif(v_engagement->>'homeAllianceName', ''),
      (v_engagement->>'homeSideTeamSize')::integer,
      (v_engagement->>'opponentSideTeamSize')::integer,
      v_engagement->>'scale',
      (v_engagement->>'homeKills')::integer,
      (v_engagement->>'homeDeaths')::integer,
      (v_engagement->>'homeKillFame')::bigint,
      (v_engagement->>'opponentKillFame')::bigint,
      (v_engagement->>'resultEventCount')::integer,
      (v_engagement->>'interventionEventCount')::integer,
      array(
        select jsonb_array_elements_text(
          coalesce(v_engagement->'eventIds', '[]'::jsonb)
        )
      ),
      p_source_hash,
      'agm_zvz_v2',
      clock_timestamp()
    from public.battle_records br
    where br.id = p_battle_record_id
    returning id into v_engagement_id;

    v_engagement_count := v_engagement_count + 1;

    for v_matchup in
      select value
      from jsonb_array_elements(coalesce(v_engagement->'matchups', '[]'::jsonb))
    loop
      insert into public.public_zvz_engagement_matchups (
        engagement_id,
        opponent_force_key,
        opponent_force_kind,
        opponent_albion_id,
        opponent_name,
        opponent_alliance_id,
        opponent_team_size,
        role,
        event_count,
        home_kills,
        home_deaths,
        home_kill_fame,
        opponent_kill_fame
      ) values (
        v_engagement_id,
        v_matchup->>'opponentForceKey',
        v_matchup->>'opponentForceKind',
        v_matchup->>'opponentAlbionId',
        v_matchup->>'opponentName',
        nullif(v_matchup->>'opponentAllianceId', ''),
        (v_matchup->>'opponentTeamSize')::integer,
        v_matchup->>'role',
        (v_matchup->>'eventCount')::integer,
        (v_matchup->>'homeKills')::integer,
        (v_matchup->>'homeDeaths')::integer,
        (v_matchup->>'homeKillFame')::bigint,
        (v_matchup->>'opponentKillFame')::bigint
      );
    end loop;

    for v_evidence in
      select value
      from jsonb_array_elements(coalesce(v_engagement->'evidence', '[]'::jsonb))
    loop
      insert into public.public_zvz_entity_engagement_evidence (
        engagement_id,
        entity_kind,
        entity_albion_id,
        entity_name,
        alliance_albion_id,
        alliance_name,
        own_team_size,
        side_team_size,
        participation_share,
        battle_credit,
        battle_points,
        kills,
        deaths,
        kill_fame,
        participation_kind
      ) values (
        v_engagement_id,
        v_evidence->>'entityKind',
        v_evidence->>'entityAlbionId',
        v_evidence->>'entityName',
        nullif(v_evidence->>'allianceAlbionId', ''),
        nullif(v_evidence->>'allianceName', ''),
        (v_evidence->>'ownTeamSize')::integer,
        (v_evidence->>'sideTeamSize')::integer,
        (v_evidence->>'participationShare')::numeric,
        (v_evidence->>'battleCredit')::numeric,
        (v_evidence->>'battlePoints')::numeric,
        (v_evidence->>'kills')::integer,
        (v_evidence->>'deaths')::integer,
        (v_evidence->>'killFame')::bigint,
        v_evidence->>'participationKind'
      );
      v_evidence_count := v_evidence_count + 1;
    end loop;
  end loop;

  insert into public.public_zvz_battle_projection_runs (
    battle_record_id,
    source_hash,
    coverage,
    is_candidate,
    observed_event_count,
    expected_event_count,
    engagement_count,
    projected_at
  ) values (
    p_battle_record_id,
    p_source_hash,
    p_coverage,
    coalesce(p_is_candidate, false),
    p_observed_event_count,
    p_expected_event_count,
    v_engagement_count,
    clock_timestamp()
  )
  on conflict (battle_record_id) do update
    set source_hash = excluded.source_hash,
        coverage = excluded.coverage,
        is_candidate = excluded.is_candidate,
        observed_event_count = excluded.observed_event_count,
        expected_event_count = excluded.expected_event_count,
        engagement_count = excluded.engagement_count,
        projected_at = excluded.projected_at;

  return jsonb_build_object(
    'battle_record_id', p_battle_record_id,
    'engagements', v_engagement_count,
    'evidence', v_evidence_count,
    'coverage', p_coverage
  );
end;
$$;

revoke all on function public.replace_public_zvz_battle_projection(uuid, text, text, boolean, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_public_zvz_battle_projection(uuid, text, text, boolean, integer, integer, jsonb)
  to service_role;

create or replace function public.refresh_public_zvz_v2_season_snapshots(
  p_season_id uuid,
  p_through_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
declare
  v_server text;
  v_season_name text;
  v_season_start date;
  v_next_start date;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_last_date date;
  v_dates date[];
  v_evidence_rows integer := 0;
  v_rollup_rows integer := 0;
begin
  select
    season.albion_server,
    season.name,
    season.starts_on,
    (
      select min(next_season.starts_on)
      from public.zvz_seasons next_season
      where next_season.albion_server = season.albion_server
        and next_season.starts_on > season.starts_on
    )
  into v_server, v_season_name, v_season_start, v_next_start
  from public.zvz_seasons season
  where season.id = p_season_id;

  if not found then
    raise exception 'season not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-v2-season:' || p_season_id::text, 0)
  );

  v_last_date := least(
    coalesce(p_through_date, v_today),
    v_today,
    coalesce(v_next_start - 1, coalesce(p_through_date, v_today))
  );

  if v_last_date < v_season_start then
    return jsonb_build_object(
      'season_id', p_season_id,
      'season_name', v_season_name,
      'status', 'not_started',
      'snapshot_days', 0,
      'evidence', 0,
      'rollups', 0
    );
  end if;

  select array_agg(candidate.snapshot_date order by candidate.snapshot_date)
    into v_dates
  from (
    select generated.day_value::date as snapshot_date
    from generate_series(
      v_season_start::timestamp,
      v_last_date::timestamp,
      interval '1 day'
    ) generated(day_value)
  ) candidate
  where p_force
     or not exists (
       select 1
       from public.public_zvz_v2_season_snapshots existing
       where existing.season_id = p_season_id
         and existing.snapshot_date = candidate.snapshot_date
         and existing.is_final
     );

  if coalesce(cardinality(v_dates), 0) = 0 then
    return jsonb_build_object(
      'season_id', p_season_id,
      'season_name', v_season_name,
      'status', 'unchanged',
      'snapshot_days', 0,
      'evidence', 0,
      'rollups', 0
    );
  end if;

  delete from public.public_zvz_v2_season_snapshots
   where season_id = p_season_id
     and snapshot_date = any(v_dates);

  insert into public.public_zvz_v2_season_snapshots (
    season_id,
    snapshot_date,
    data_through_at,
    is_final,
    guild_count,
    alliance_count,
    refreshed_at
  )
  select
    p_season_id,
    day.snapshot_date,
    least(
      clock_timestamp(),
      ((day.snapshot_date + 1)::timestamp at time zone 'UTC')
    ),
    ((day.snapshot_date + 1)::timestamp at time zone 'UTC')
      <= clock_timestamp() - interval '48 hours',
    0,
    0,
    clock_timestamp()
  from unnest(v_dates) day(snapshot_date);

  insert into public.public_zvz_v2_season_evidence (
    season_id,
    evidence_date,
    engagement_id,
    battle_record_id,
    albion_server,
    battle_started_at,
    battle_ended_at,
    engagement_key,
    result,
    scale,
    entity_kind,
    entity_albion_id,
    entity_name,
    alliance_albion_id,
    alliance_name,
    own_team_size,
    side_team_size,
    opponent_side_team_size,
    participation_share,
    battle_credit,
    battle_points,
    kills,
    deaths,
    kill_fame,
    participation_kind,
    opponents,
    qualification_version,
    frozen_at
  )
  select
    p_season_id,
    (engagement.started_at at time zone 'UTC')::date,
    engagement.id,
    engagement.battle_record_id,
    engagement.albion_server,
    engagement.started_at,
    engagement.ended_at,
    engagement.engagement_key,
    engagement.result,
    engagement.scale,
    evidence.entity_kind,
    evidence.entity_albion_id,
    evidence.entity_name,
    evidence.alliance_albion_id,
    evidence.alliance_name,
    evidence.own_team_size,
    evidence.side_team_size,
    engagement.opponent_side_team_size,
    evidence.participation_share,
    evidence.battle_credit,
    evidence.battle_points,
    evidence.kills,
    evidence.deaths,
    evidence.kill_fame,
    evidence.participation_kind,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'forceKey', matchup.opponent_force_key,
            'forceKind', matchup.opponent_force_kind,
            'albionId', matchup.opponent_albion_id,
            'name', matchup.opponent_name,
            'allianceId', matchup.opponent_alliance_id,
            'teamSize', matchup.opponent_team_size,
            'role', matchup.role,
            'eventCount', matchup.event_count,
            'kills', matchup.home_deaths,
            'deaths', matchup.home_kills,
            'killFame', matchup.opponent_kill_fame
          )
          order by
            case when matchup.role = 'result_eligible' then 0 else 1 end,
            matchup.event_count desc,
            matchup.opponent_force_key
        ),
        '[]'::jsonb
      )
      from public.public_zvz_engagement_matchups matchup
      where matchup.engagement_id = engagement.id
    ),
    engagement.qualification_version,
    clock_timestamp()
  from public.public_zvz_engagements engagement
  join public.public_zvz_entity_engagement_evidence evidence
    on evidence.engagement_id = engagement.id
  where engagement.albion_server = v_server
    and engagement.status = 'final'
    and (engagement.started_at at time zone 'UTC')::date = any(v_dates)
    and engagement.started_at >= v_season_start::timestamptz
    and (v_next_start is null or engagement.started_at < v_next_start::timestamptz);

  get diagnostics v_evidence_rows = row_count;

  with snapshot_days as (
    select day.snapshot_date
    from unnest(v_dates) day(snapshot_date)
  ),
  expanded as (
    select
      day.snapshot_date,
      evidence.*,
      scope.value as scope
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date between v_season_start and day.snapshot_date
    cross join lateral (
      values ('overall'::text), (evidence.scale)
    ) scope(value)
  ),
  ordered as (
    select
      expanded.*,
      row_number() over (
        partition by
          expanded.snapshot_date,
          expanded.entity_kind,
          expanded.entity_albion_id,
          expanded.scope
        order by
          expanded.own_team_size desc,
          expanded.battle_started_at desc,
          expanded.engagement_id
      ) as size_order
    from expanded
  ),
  aggregated as (
    select
      ordered.snapshot_date,
      ordered.entity_kind,
      ordered.entity_albion_id,
      ordered.scope,
      (array_agg(
        ordered.entity_name
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as entity_name,
      (array_agg(
        ordered.alliance_albion_id
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as alliance_albion_id,
      (array_agg(
        ordered.alliance_name
        order by ordered.battle_started_at desc, ordered.engagement_id desc
      ))[1] as alliance_name,
      count(*)::integer as engagement_count,
      sum(ordered.battle_credit)::numeric as equivalent_battles,
      sum(ordered.kills)::integer as kills,
      sum(ordered.deaths)::integer as deaths,
      sum(ordered.kill_fame)::bigint as kill_fame,
      round(avg(ordered.own_team_size) filter (where ordered.size_order <= 3), 2)
        as representative_size,
      round(avg(ordered.own_team_size), 2) as average_size,
      max(ordered.own_team_size)::integer as max_size,
      round(avg(greatest(
        0::numeric,
        ordered.kills * 3
          + greatest(ordered.kills - ordered.deaths, 0) * 2
          + ordered.kill_fame::numeric / 500000
          - greatest(ordered.deaths - ordered.kills, 0) * 0.5
      )), 6) as combat_index,
      round(sum(ordered.battle_points), 6) as battle_points,
      max(ordered.battle_started_at) as latest_battle_at
    from ordered
    group by
      ordered.snapshot_date,
      ordered.entity_kind,
      ordered.entity_albion_id,
      ordered.scope
  ),
  enriched as (
    select
      aggregated.*,
      link.tenant_id,
      link.tenant_slug,
      coalesce(link.profile_enabled, false) as tenant_profile_enabled,
      case
        when aggregated.engagement_count >= 2 then 'ranked'
        else 'insufficient_sample'
      end as sample_status
    from aggregated
    left join lateral (
      select
        candidate.tenant_id,
        candidate.tenant_slug,
        candidate.profile_enabled
      from public.public_guild_tenant_links candidate
      where aggregated.entity_kind = 'guild'
        and candidate.albion_server = v_server
        and candidate.albion_guild_id = aggregated.entity_albion_id
      order by candidate.profile_enabled desc, candidate.tenant_slug asc
      limit 1
    ) link on true
  ),
  components as (
    select
      enriched.*,
      case
        when enriched.scope = 'overall'
          then least(500::numeric, enriched.representative_size * 5)
        else 0::numeric
      end as size_points,
      case
        when enriched.combat_index <= 0 then 0::numeric
        when enriched.scope = 'overall'
          then 350::numeric * enriched.combat_index / (enriched.combat_index + 30)
        else 700::numeric * enriched.combat_index / (enriched.combat_index + 30)
      end as combat_points,
      case
        when enriched.equivalent_battles <= 0 then 0::numeric
        when enriched.scope = 'overall'
          then 150::numeric * least(
            1::numeric,
            ln(1 + enriched.equivalent_battles) / ln(11::numeric)
          )
        else 300::numeric * least(
          1::numeric,
          ln(1 + enriched.equivalent_battles) / ln(11::numeric)
        )
      end as activity_points
    from enriched
  ),
  scored as (
    select
      components.*,
      round(
        components.size_points
          + components.combat_points
          + components.activity_points,
        2
      ) as score
    from components
  ),
  ranked as (
    select
      scored.*,
      dense_rank() over (
        partition by scored.snapshot_date, scored.entity_kind, scored.scope
        order by
          case when scored.sample_status = 'ranked' then 0 else 1 end,
          scored.score desc,
          scored.kill_fame desc,
          scored.entity_name asc,
          scored.entity_albion_id asc
      )::integer as rank
    from scored
  )
  insert into public.public_zvz_v2_season_rollups (
    season_id,
    snapshot_date,
    albion_server,
    entity_kind,
    entity_albion_id,
    entity_name,
    alliance_albion_id,
    alliance_name,
    tenant_id,
    tenant_slug,
    tenant_profile_enabled,
    scope,
    engagement_count,
    equivalent_battles,
    kills,
    deaths,
    kill_fame,
    representative_size,
    average_size,
    max_size,
    combat_index,
    battle_points,
    size_points,
    combat_points,
    activity_points,
    score,
    rank,
    sample_status,
    latest_battle_at,
    score_formula_version,
    updated_at
  )
  select
    p_season_id,
    ranked.snapshot_date,
    v_server,
    ranked.entity_kind,
    ranked.entity_albion_id,
    ranked.entity_name,
    ranked.alliance_albion_id,
    ranked.alliance_name,
    ranked.tenant_id,
    ranked.tenant_slug,
    ranked.tenant_profile_enabled,
    ranked.scope,
    ranked.engagement_count,
    ranked.equivalent_battles,
    ranked.kills,
    ranked.deaths,
    ranked.kill_fame,
    ranked.representative_size,
    ranked.average_size,
    ranked.max_size,
    ranked.combat_index,
    ranked.battle_points,
    round(ranked.size_points, 6),
    round(ranked.combat_points, 6),
    round(ranked.activity_points, 6),
    ranked.score,
    ranked.rank,
    ranked.sample_status,
    ranked.latest_battle_at,
    'agm_zvz_v2',
    clock_timestamp()
  from ranked;

  get diagnostics v_rollup_rows = row_count;

  update public.public_zvz_v2_season_snapshots snapshot
     set guild_count = counts.guild_count,
         alliance_count = counts.alliance_count,
         refreshed_at = clock_timestamp()
    from (
      select
        rollup.snapshot_date,
        count(*) filter (
          where rollup.entity_kind = 'guild' and rollup.scope = 'overall'
        )::integer as guild_count,
        count(*) filter (
          where rollup.entity_kind = 'alliance' and rollup.scope = 'overall'
        )::integer as alliance_count
      from public.public_zvz_v2_season_rollups rollup
      where rollup.season_id = p_season_id
        and rollup.snapshot_date = any(v_dates)
      group by rollup.snapshot_date
    ) counts
   where snapshot.season_id = p_season_id
     and snapshot.snapshot_date = counts.snapshot_date;

  return jsonb_build_object(
    'season_id', p_season_id,
    'season_name', v_season_name,
    'status', 'refreshed',
    'through_date', v_last_date,
    'snapshot_days', cardinality(v_dates),
    'evidence', v_evidence_rows,
    'rollups', v_rollup_rows
  );
end;
$$;

revoke all on function public.refresh_public_zvz_v2_season_snapshots(uuid, date, boolean)
  from public, anon, authenticated;
grant execute on function public.refresh_public_zvz_v2_season_snapshots(uuid, date, boolean)
  to service_role;

create or replace function public.refresh_current_public_zvz_v2_season_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_season record;
  v_result jsonb := '[]'::jsonb;
begin
  for v_season in
    select season.id
    from public.zvz_seasons season
    where season.starts_on <= v_today
      and not exists (
        select 1
        from public.zvz_seasons next_season
        where next_season.albion_server = season.albion_server
          and next_season.starts_on > season.starts_on
          and next_season.starts_on <= v_today
      )
    order by season.albion_server
  loop
    v_result := v_result || jsonb_build_array(
      public.refresh_public_zvz_v2_season_snapshots(
        v_season.id,
        v_today,
        false
      )
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.refresh_current_public_zvz_v2_season_snapshots()
  from public, anon, authenticated;
grant execute on function public.refresh_current_public_zvz_v2_season_snapshots()
  to service_role;

create or replace function public.search_public_zvz_entities(
  p_query text,
  p_albion_server text default null,
  p_season_id uuid default null,
  p_as_of_date date default null,
  p_limit integer default 12
)
returns table (
  period_kind text,
  albion_server text,
  season_id uuid,
  snapshot_date date,
  week_start date,
  entity_kind text,
  albion_id text,
  entity_name text,
  alliance_name text,
  division text,
  rank integer,
  battle_count integer,
  related_guild_count integer,
  latest_battle_at timestamptz,
  tenant_slug text,
  tenant_profile_enabled boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g');
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_target_date date := least(coalesce(p_as_of_date, v_today), v_today);
  v_limit integer := least(24, greatest(1, coalesce(p_limit, 12)));
begin
  if char_length(v_query) < 2 or char_length(v_query) > 80 then
    return;
  end if;
  if p_albion_server is not null
     and p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  if p_season_id is not null and p_albion_server is null then
    raise exception 'an explicit season requires an Albion server';
  end if;

  return query
  with server_scope(server) as (
    select unnest(
      case
        when p_albion_server is null
          then array['west', 'europe', 'east']::text[]
        else array[p_albion_server]::text[]
      end
    )
  ),
  season_bounds as (
    select
      season.id,
      season.albion_server as server,
      season.starts_on,
      lead(season.starts_on) over (
        partition by season.albion_server
        order by season.starts_on
      ) as ends_on
    from public.zvz_seasons season
  ),
  selected_seasons as (
    select distinct on (scope.server)
      scope.server,
      season.id as season_id,
      season.starts_on,
      season.ends_on
    from server_scope scope
    join season_bounds season on season.server = scope.server
    where (
      p_season_id is not null and season.id = p_season_id
    ) or (
      p_season_id is null
      and season.starts_on <= v_target_date
      and (season.ends_on is null or v_target_date < season.ends_on)
    )
    order by scope.server, season.starts_on desc
  ),
  selected_periods as (
    select
      season.server,
      season.season_id,
      snapshot.snapshot_date
    from selected_seasons season
    join lateral (
      select candidate.snapshot_date
      from public.public_zvz_v2_season_snapshots candidate
      where candidate.season_id = season.season_id
        and candidate.snapshot_date <= least(
          greatest(v_target_date, season.starts_on),
          coalesce(season.ends_on - 1, v_target_date)
        )
      order by candidate.snapshot_date desc
      limit 1
    ) snapshot on true
  ),
  matched as (
    select
      period.server,
      period.season_id,
      period.snapshot_date,
      rollup.entity_kind,
      rollup.entity_albion_id,
      rollup.entity_name,
      rollup.alliance_name,
      case
        when rollup.representative_size <= 20 then 'small'
        when rollup.representative_size <= 40 then 'mid'
        when rollup.representative_size <= 80 then 'large'
        else 'zerg'
      end as division,
      rollup.rank,
      rollup.engagement_count,
      case
        when rollup.entity_kind = 'guild' then 1
        else (
          select count(distinct evidence.entity_albion_id)::integer
          from public.public_zvz_v2_season_evidence evidence
          where evidence.season_id = period.season_id
            and evidence.evidence_date <= period.snapshot_date
            and evidence.entity_kind = 'guild'
            and evidence.alliance_albion_id = rollup.entity_albion_id
        )
      end as related_guild_count,
      rollup.latest_battle_at,
      rollup.tenant_slug,
      rollup.tenant_profile_enabled,
      case
        when lower(rollup.entity_name) = lower(v_query)
          or lower(rollup.entity_albion_id) = lower(v_query) then 0
        when left(lower(rollup.entity_name), char_length(v_query)) = lower(v_query)
          or left(lower(rollup.entity_albion_id), char_length(v_query)) = lower(v_query)
          then 1
        else 2
      end as relevance
    from selected_periods period
    join public.public_zvz_v2_season_rollups rollup
      on rollup.season_id = period.season_id
     and rollup.snapshot_date = period.snapshot_date
     and rollup.albion_server = period.server
     and rollup.scope = 'overall'
    where position(lower(v_query) in lower(rollup.entity_name)) > 0
       or position(lower(v_query) in lower(rollup.entity_albion_id)) > 0
  )
  select
    'season'::text,
    matched.server,
    matched.season_id,
    matched.snapshot_date,
    null::date,
    matched.entity_kind,
    matched.entity_albion_id,
    matched.entity_name,
    matched.alliance_name,
    matched.division,
    matched.rank,
    matched.engagement_count,
    matched.related_guild_count,
    matched.latest_battle_at,
    matched.tenant_slug,
    matched.tenant_profile_enabled
  from matched
  order by
    matched.relevance,
    case matched.entity_kind when 'guild' then 0 else 1 end,
    lower(matched.entity_name),
    matched.server
  limit v_limit;
end;
$$;

revoke all on function public.search_public_zvz_entities(text, text, uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_zvz_entities(text, text, uuid, date, integer)
  to service_role;

comment on function public.search_public_zvz_entities(text, text, uuid, date, integer) is
  'Searches v2 tenant-neutral guild and alliance rankings in the selected finalized/provisional season snapshot.';
