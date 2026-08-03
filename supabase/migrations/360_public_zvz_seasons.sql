-- Season-based AGM Battles ranking model.
--
-- A season is configured per Albion server by its UTC start date. Its end is
-- the next season's start date, so operators never need to guess a fixed
-- three-month duration. Daily snapshots preserve the public ranking as-of a
-- UTC date; only snapshots still inside the 48-hour correction window are
-- refreshed automatically.

create table if not exists public.zvz_seasons (
  id uuid primary key default gen_random_uuid(),
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_on date not null,
  score_formula_version text not null default 'agm_zvz_v1'
    check (score_formula_version = 'agm_zvz_v1'),
  created_by_discord_id text,
  updated_by_discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (albion_server, starts_on)
);

create index if not exists idx_zvz_seasons_server_start
  on public.zvz_seasons (albion_server, starts_on desc);

alter table public.zvz_seasons enable row level security;
revoke all on public.zvz_seasons from anon, authenticated;
grant select, insert, update, delete on public.zvz_seasons to service_role;

comment on table public.zvz_seasons is
  'Operator-defined Albion season boundaries for public AGM Battles rankings. The next start date is the exclusive end.';

create table if not exists public.zvz_season_snapshots (
  season_id uuid not null references public.zvz_seasons(id) on delete cascade,
  snapshot_date date not null,
  data_through_at timestamptz not null,
  is_final boolean not null default false,
  guild_count integer not null default 0 check (guild_count >= 0),
  refreshed_at timestamptz not null default now(),
  primary key (season_id, snapshot_date)
);

create index if not exists idx_zvz_season_snapshots_history
  on public.zvz_season_snapshots (season_id, snapshot_date desc);

alter table public.zvz_season_snapshots enable row level security;
revoke all on public.zvz_season_snapshots from anon, authenticated;
grant select, insert, update, delete on public.zvz_season_snapshots to service_role;

comment on table public.zvz_season_snapshots is
  'Daily UTC publication checkpoints for a season ranking. Final snapshots are immutable to automatic refresh.';

create table if not exists public.guild_season_zvz_rollups (
  season_id uuid not null,
  snapshot_date date not null,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  guild_albion_id text not null,
  guild_name text not null,
  alliance_albion_id text,
  alliance_name text,
  tenant_id uuid references public.tenants(id) on delete set null,
  tenant_slug text,
  tenant_profile_enabled boolean not null default false,
  division text not null check (division in ('small', 'mid', 'large', 'zerg')),
  zvz_battles integer not null check (zvz_battles >= 0),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  avg_force_size numeric(10, 2) not null check (avg_force_size >= 0),
  max_force_size integer not null check (max_force_size >= 0),
  score numeric(18, 2) not null,
  rank integer not null check (rank >= 1),
  sample_status text not null check (sample_status in ('ranked', 'insufficient_sample')),
  latest_battle_at timestamptz,
  score_formula_version text not null,
  battle_points numeric(18, 6) not null default 0,
  kill_points numeric(18, 6) not null default 0,
  kd_bonus_points numeric(18, 6) not null default 0,
  kill_fame_points numeric(18, 6) not null default 0,
  force_size_points numeric(18, 6) not null default 0,
  death_penalty_points numeric(18, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, snapshot_date, guild_albion_id),
  foreign key (season_id, snapshot_date)
    references public.zvz_season_snapshots(season_id, snapshot_date)
    on delete cascade
);

create index if not exists idx_guild_season_zvz_rank
  on public.guild_season_zvz_rollups (
    season_id,
    snapshot_date desc,
    sample_status,
    rank
  );

create index if not exists idx_guild_season_zvz_history
  on public.guild_season_zvz_rollups (
    albion_server,
    guild_albion_id,
    season_id,
    snapshot_date desc
  );

alter table public.guild_season_zvz_rollups enable row level security;
revoke all on public.guild_season_zvz_rollups from anon, authenticated;
grant select, insert, update, delete on public.guild_season_zvz_rollups to service_role;

comment on table public.guild_season_zvz_rollups is
  'Cumulative public guild ranking as of one UTC date inside an operator-defined Albion season.';

create table if not exists public.guild_season_zvz_battle_evidence (
  season_id uuid not null,
  evidence_date date not null,
  week_start date not null,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  guild_albion_id text not null,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  battle_started_at timestamptz not null,
  guild_name text not null,
  alliance_albion_id text,
  alliance_name text,
  team_size integer not null check (team_size >= 10),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  qualification_version text not null,
  refreshed_at timestamptz not null default now(),
  primary key (
    season_id,
    evidence_date,
    guild_albion_id,
    battle_record_id
  ),
  foreign key (season_id, evidence_date)
    references public.zvz_season_snapshots(season_id, snapshot_date)
    on delete cascade
);

create index if not exists idx_guild_season_zvz_evidence_guild
  on public.guild_season_zvz_battle_evidence (
    season_id,
    guild_albion_id,
    evidence_date desc,
    battle_started_at desc
  );

create index if not exists idx_guild_season_zvz_evidence_alliance
  on public.guild_season_zvz_battle_evidence (
    season_id,
    alliance_albion_id,
    evidence_date desc,
    battle_started_at desc
  )
  where alliance_albion_id is not null;

alter table public.guild_season_zvz_battle_evidence enable row level security;
revoke all on public.guild_season_zvz_battle_evidence from anon, authenticated;
grant select, insert, update, delete
  on public.guild_season_zvz_battle_evidence
  to service_role;

comment on table public.guild_season_zvz_battle_evidence is
  'Daily season-scoped copies of public battle evidence. Facts freeze with the matching daily snapshot so historical score and evidence cannot diverge.';

create or replace function public.save_public_zvz_season(
  p_season_id uuid,
  p_albion_server text,
  p_name text,
  p_starts_on date,
  p_actor_discord_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_season_id;
  v_existing public.zvz_seasons%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_boundaries_changed boolean := false;
begin
  if p_albion_server is null
     or p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'season name must be 1-80 characters';
  end if;
  if p_starts_on is null then
    raise exception 'season start date is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-seasons:' || p_albion_server, 0)
  );

  if v_id is null then
    insert into public.zvz_seasons (
      albion_server,
      name,
      starts_on,
      created_by_discord_id,
      updated_by_discord_id
    ) values (
      p_albion_server,
      v_name,
      p_starts_on,
      nullif(btrim(coalesce(p_actor_discord_id, '')), ''),
      nullif(btrim(coalesce(p_actor_discord_id, '')), '')
    )
    returning id into v_id;
    v_boundaries_changed := true;
  else
    select *
      into v_existing
      from public.zvz_seasons
     where id = v_id
     for update;

    if not found then
      raise exception 'season not found';
    end if;
    if v_existing.albion_server <> p_albion_server then
      raise exception 'season server cannot be changed';
    end if;

    v_boundaries_changed := v_existing.starts_on <> p_starts_on;
    update public.zvz_seasons
       set name = v_name,
           starts_on = p_starts_on,
           updated_by_discord_id = nullif(btrim(coalesce(p_actor_discord_id, '')), ''),
           updated_at = now()
     where id = v_id;
  end if;

  if v_boundaries_changed then
    -- These rows are entirely derived. A boundary edit can affect both the
    -- edited season and its neighbours, so rebuild the server as one unit.
    delete from public.zvz_season_snapshots snapshot
     using public.zvz_seasons season
     where snapshot.season_id = season.id
       and season.albion_server = p_albion_server;
  end if;

  return jsonb_build_object(
    'season_id', v_id,
    'albion_server', p_albion_server,
    'name', v_name,
    'starts_on', p_starts_on,
    'boundaries_changed', v_boundaries_changed
  );
end;
$$;

revoke all on function public.save_public_zvz_season(uuid, text, text, date, text)
  from public, anon, authenticated;
grant execute on function public.save_public_zvz_season(uuid, text, text, date, text)
  to service_role;

create or replace function public.refresh_guild_zvz_season_snapshots(
  p_season_id uuid,
  p_through_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server text;
  v_season_name text;
  v_season_start date;
  v_next_start date;
  v_formula_version text;
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
    ),
    season.score_formula_version
  into
    v_server,
    v_season_name,
    v_season_start,
    v_next_start,
    v_formula_version
  from public.zvz_seasons season
  where season.id = p_season_id;

  if not found then
    raise exception 'season not found';
  end if;
  if v_formula_version <> 'agm_zvz_v1' then
    raise exception 'unsupported score formula version: %', v_formula_version;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-seasons:' || v_server, 0)
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
      'rows', 0
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
        from public.zvz_season_snapshots existing
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
      'rows', 0
    );
  end if;

  delete from public.zvz_season_snapshots
   where season_id = p_season_id
     and snapshot_date = any(v_dates);

  insert into public.zvz_season_snapshots (
    season_id,
    snapshot_date,
    data_through_at,
    is_final,
    guild_count,
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
    clock_timestamp()
  from unnest(v_dates) day(snapshot_date);

  insert into public.guild_season_zvz_battle_evidence (
    season_id,
    evidence_date,
    week_start,
    albion_server,
    guild_albion_id,
    battle_record_id,
    battle_started_at,
    guild_name,
    alliance_albion_id,
    alliance_name,
    team_size,
    kills,
    deaths,
    kill_fame,
    qualification_version,
    refreshed_at
  )
  select
    p_season_id,
    (e.battle_started_at at time zone 'UTC')::date,
    e.week_start,
    e.albion_server,
    e.guild_albion_id,
    e.battle_record_id,
    e.battle_started_at,
    e.guild_name,
    e.alliance_albion_id,
    e.alliance_name,
    e.team_size,
    e.kills,
    e.deaths,
    e.kill_fame,
    e.qualification_version,
    clock_timestamp()
  from public.guild_weekly_zvz_battle_evidence e
  where e.albion_server = v_server
    and (e.battle_started_at at time zone 'UTC')::date = any(v_dates)
    and e.battle_started_at >= (v_season_start::timestamp at time zone 'UTC')
    and (
      v_next_start is null
      or e.battle_started_at < (v_next_start::timestamp at time zone 'UTC')
    );

  get diagnostics v_evidence_rows = row_count;

  with snapshot_days as (
    select day.snapshot_date
    from unnest(v_dates) day(snapshot_date)
  ),
  aggregated as (
    select
      day.snapshot_date,
      e.guild_albion_id,
      (array_agg(
        e.guild_name
        order by e.battle_started_at desc, e.battle_record_id desc
      ))[1] as guild_name,
      (array_agg(
        e.alliance_albion_id
        order by e.battle_started_at desc, e.battle_record_id desc
      ))[1] as alliance_albion_id,
      (array_agg(
        e.alliance_name
        order by e.battle_started_at desc, e.battle_record_id desc
      ))[1] as alliance_name,
      count(*)::integer as zvz_battles,
      sum(e.kills)::integer as kills,
      sum(e.deaths)::integer as deaths,
      sum(e.kill_fame)::bigint as kill_fame,
      round(avg(e.team_size)::numeric, 2) as avg_force_size,
      max(e.team_size)::integer as max_force_size,
      max(e.battle_started_at) as latest_battle_at
    from snapshot_days day
    join public.guild_season_zvz_battle_evidence e
      on e.season_id = p_season_id
     and e.evidence_date between v_season_start and day.snapshot_date
    group by day.snapshot_date, e.guild_albion_id
  ),
  enriched as (
    select
      a.*,
      link.tenant_id,
      link.tenant_slug,
      coalesce(link.profile_enabled, false) as tenant_profile_enabled
    from aggregated a
    left join lateral (
      select
        candidate.tenant_id,
        candidate.tenant_slug,
        candidate.profile_enabled
      from public.public_guild_tenant_links candidate
      where candidate.albion_server = v_server
        and candidate.albion_guild_id = a.guild_albion_id
      order by candidate.profile_enabled desc, candidate.tenant_slug asc
      limit 1
    ) link on true
  ),
  classified as (
    select
      e.*,
      case
        when e.avg_force_size <= 20 then 'small'
        when e.avg_force_size <= 40 then 'mid'
        when e.avg_force_size <= 80 then 'large'
        else 'zerg'
      end as division,
      case
        when e.zvz_battles >= 2 then 'ranked'
        else 'insufficient_sample'
      end as sample_status
    from enriched e
  ),
  components as (
    select
      c.*,
      (c.zvz_battles * 25)::numeric as battle_points,
      (c.kills * 3)::numeric as kill_points,
      (greatest(c.kills - c.deaths, 0) * 2)::numeric as kd_bonus_points,
      (c.kill_fame::numeric / 500000) as kill_fame_points,
      (c.avg_force_size * 1.5)::numeric as force_size_points,
      (greatest(c.deaths - c.kills, 0) * 0.5)::numeric as death_penalty_points
    from classified c
  ),
  scored as (
    select
      c.*,
      round((
        c.battle_points
        + c.kill_points
        + c.kd_bonus_points
        + c.kill_fame_points
        + c.force_size_points
        - c.death_penalty_points
      )::numeric, 2) as score
    from components c
  ),
  ranked as (
    select
      s.*,
      dense_rank() over (
        partition by s.snapshot_date
        order by
          case when s.sample_status = 'ranked' then 0 else 1 end,
          s.score desc,
          s.kill_fame desc,
          s.guild_name asc
      )::integer as rank
    from scored s
  )
  insert into public.guild_season_zvz_rollups (
    season_id,
    snapshot_date,
    albion_server,
    guild_albion_id,
    guild_name,
    alliance_albion_id,
    alliance_name,
    tenant_id,
    tenant_slug,
    tenant_profile_enabled,
    division,
    zvz_battles,
    kills,
    deaths,
    kill_fame,
    avg_force_size,
    max_force_size,
    score,
    rank,
    sample_status,
    latest_battle_at,
    score_formula_version,
    battle_points,
    kill_points,
    kd_bonus_points,
    kill_fame_points,
    force_size_points,
    death_penalty_points,
    updated_at
  )
  select
    p_season_id,
    snapshot_date,
    v_server,
    guild_albion_id,
    guild_name,
    alliance_albion_id,
    alliance_name,
    tenant_id,
    tenant_slug,
    tenant_profile_enabled,
    division,
    zvz_battles,
    kills,
    deaths,
    kill_fame,
    avg_force_size,
    max_force_size,
    score,
    rank,
    sample_status,
    latest_battle_at,
    v_formula_version,
    battle_points,
    kill_points,
    kd_bonus_points,
    kill_fame_points,
    force_size_points,
    death_penalty_points,
    clock_timestamp()
  from ranked;

  get diagnostics v_rollup_rows = row_count;

  update public.zvz_season_snapshots snapshot
     set guild_count = counts.guild_count
    from (
      select rollup.snapshot_date, count(*)::integer as guild_count
      from public.guild_season_zvz_rollups rollup
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
    'snapshot_days', cardinality(v_dates),
    'evidence_rows', v_evidence_rows,
    'rows', v_rollup_rows,
    'through_date', v_last_date
  );
end;
$$;

revoke all on function public.refresh_guild_zvz_season_snapshots(uuid, date, boolean)
  from public, anon, authenticated;
grant execute on function public.refresh_guild_zvz_season_snapshots(uuid, date, boolean)
  to service_role;

create or replace function public.refresh_all_guild_zvz_season_snapshots(
  p_albion_server text,
  p_force boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_results jsonb := '[]'::jsonb;
begin
  if p_albion_server is null
     or p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;

  for v_season in
    select id
    from public.zvz_seasons
    where albion_server = p_albion_server
    order by starts_on
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_guild_zvz_season_snapshots(
        v_season.id,
        v_today,
        p_force
      )
    );
  end loop;

  return jsonb_build_object(
    'albion_server', p_albion_server,
    'seasons', v_results
  );
end;
$$;

revoke all on function public.refresh_all_guild_zvz_season_snapshots(text, boolean)
  from public, anon, authenticated;
grant execute on function public.refresh_all_guild_zvz_season_snapshots(text, boolean)
  to service_role;

create or replace function public.refresh_current_guild_zvz_season_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_results jsonb := '[]'::jsonb;
begin
  for v_season in
    select bounded.id, bounded.albion_server
    from (
      select
        season.id,
        season.albion_server,
        season.starts_on,
        lead(season.starts_on) over (
          partition by season.albion_server
          order by season.starts_on
        ) as next_start
      from public.zvz_seasons season
    ) bounded
    where bounded.starts_on <= v_today
      and (
        bounded.next_start is null
        or bounded.next_start >= v_today - 2
        or exists (
          select 1
          from public.zvz_season_snapshots pending
          where pending.season_id = bounded.id
            and not pending.is_final
        )
      )
    order by bounded.albion_server, bounded.starts_on
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_guild_zvz_season_snapshots(
        v_season.id,
        v_today,
        false
      )
    );
  end loop;

  return jsonb_build_object('seasons', v_results);
end;
$$;

revoke all on function public.refresh_current_guild_zvz_season_snapshots()
  from public, anon, authenticated;
grant execute on function public.refresh_current_guild_zvz_season_snapshots()
  to service_role;
