-- 368: Preserve official battle evidence at the force level.
--
-- Guild ranking evidence intentionally excludes guild forces below 10 players.
-- An official 20v20 alliance fight can still consist entirely of smaller member
-- guilds, so alliance records must not be derived from score-eligible guild rows.

create table if not exists public.public_zvz_force_battle_evidence (
  week_start date not null,
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  battle_started_at timestamptz not null,
  force_key text not null,
  force_kind text not null check (force_kind in ('alliance', 'guild')),
  force_name text not null,
  alliance_albion_id text,
  alliance_name text,
  guild_ids text[] not null default '{}',
  guild_names text[] not null default '{}',
  team_size integer not null check (team_size >= 10),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  qualification_version text not null,
  refreshed_at timestamptz not null default now(),
  primary key (week_start, albion_server, force_key, battle_record_id)
);

create index if not exists idx_public_zvz_force_evidence_alliance
  on public.public_zvz_force_battle_evidence (
    albion_server,
    alliance_albion_id,
    battle_started_at desc
  )
  where alliance_albion_id is not null;

create index if not exists idx_public_zvz_force_evidence_battle
  on public.public_zvz_force_battle_evidence (battle_record_id);

alter table public.public_zvz_force_battle_evidence enable row level security;
revoke all on public.public_zvz_force_battle_evidence from anon, authenticated;
grant select, insert, update, delete
  on public.public_zvz_force_battle_evidence to service_role;

comment on table public.public_zvz_force_battle_evidence is
  'Meaningful alliance-level forces in official AGM Battles fights. Kept separately from score-eligible guild evidence so fragmented alliances retain complete battle records.';

create or replace function public.refresh_public_zvz_force_battle_evidence(
  p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  v_week_start date := coalesce(p_week_start, date_trunc('week', now())::date);
  v_rows integer := 0;
begin
  delete from public.public_zvz_force_battle_evidence
   where week_start = v_week_start;

  with alliance_forces as (
    select
      br.id as battle_record_id,
      br.albion_server,
      br.started_at,
      br.ended_at,
      row_number() over (
        partition by br.id
        order by bfs.team_size desc, bfs.kill_fame desc, bfs.force_name asc
      ) as force_rank,
      bfs.team_size,
      bfs.kills,
      bfs.deaths
    from public.battle_records br
    join public.battle_force_summaries bfs
      on bfs.battle_record_id = br.id
     and bfs.force_level = 'alliance'
     and bfs.team_size >= 10
    where br.started_at >= v_week_start::timestamptz
      and br.started_at < (v_week_start + 7)::timestamptz
  ),
  zvz_battles as (
    select
      a.battle_record_id,
      a.albion_server,
      a.started_at
    from alliance_forces a
    join alliance_forces b
      on b.battle_record_id = a.battle_record_id
     and b.force_rank = 2
    where a.force_rank = 1
      and a.team_size >= 20
      and b.team_size >= 20
      and not ((a.kills + a.deaths) < (a.team_size * 0.1) and a.deaths < 3)
      and not ((b.kills + b.deaths) < (b.team_size * 0.1) and b.deaths < 3)
      and not (
        extract(epoch from (a.ended_at - a.started_at)) < 120
        and (
          (
            a.kills >= 3
            and a.deaths <= 1
            and b.kills <= 1
            and not (a.kills > 0 and a.deaths > 0 and b.kills > 0 and b.deaths > 0)
          )
          or (
            b.kills >= 3
            and b.deaths <= 1
            and a.kills <= 1
            and not (a.kills > 0 and a.deaths > 0 and b.kills > 0 and b.deaths > 0)
          )
        )
      )
  )
  insert into public.public_zvz_force_battle_evidence (
    week_start,
    albion_server,
    battle_record_id,
    battle_started_at,
    force_key,
    force_kind,
    force_name,
    alliance_albion_id,
    alliance_name,
    guild_ids,
    guild_names,
    team_size,
    kills,
    deaths,
    kill_fame,
    qualification_version,
    refreshed_at
  )
  select
    v_week_start,
    battle.albion_server,
    battle.battle_record_id,
    battle.started_at,
    force.force_key,
    force.force_kind,
    force.force_name,
    force.alliance_id,
    force.alliance_name,
    force.guild_ids,
    force.guild_names,
    force.team_size,
    force.kills,
    force.deaths,
    force.kill_fame,
    'agm_zvz_v2_20plus',
    clock_timestamp()
  from zvz_battles battle
  join public.battle_force_summaries force
    on force.battle_record_id = battle.battle_record_id
   and force.force_level = 'alliance'
   and force.team_size >= 10;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.refresh_public_zvz_force_battle_evidence(date)
  from public, anon, authenticated, service_role;

-- Keep the established guild ranking function intact and wrap it so every
-- scheduled or manual refresh also rebuilds force-level evidence atomically.
alter function public.refresh_guild_weekly_zvz_rollups(date)
  rename to refresh_guild_weekly_zvz_rollups_without_force_evidence;

revoke all on function public.refresh_guild_weekly_zvz_rollups_without_force_evidence(date)
  from public, anon, authenticated, service_role;

create function public.refresh_guild_weekly_zvz_rollups(
  p_week_start date default (date_trunc('week', now())::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  v_week_start date := coalesce(p_week_start, date_trunc('week', now())::date);
  v_result jsonb;
  v_force_evidence_rows integer;
begin
  v_result := public.refresh_guild_weekly_zvz_rollups_without_force_evidence(
    v_week_start
  );
  v_force_evidence_rows := public.refresh_public_zvz_force_battle_evidence(
    v_week_start
  );

  return v_result || jsonb_build_object(
    'force_evidence_rows', v_force_evidence_rows
  );
end;
$$;

revoke all on function public.refresh_guild_weekly_zvz_rollups(date)
  from public, anon, authenticated;
grant execute on function public.refresh_guild_weekly_zvz_rollups(date)
  to service_role;

comment on function public.refresh_guild_weekly_zvz_rollups(date) is
  'Atomically rebuilds 20-plus official battle force evidence, score-eligible guild evidence, and guild rankings for one UTC week.';

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
  v_query text := regexp_replace(
    btrim(coalesce(p_query, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_target_date date;
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

  v_target_date := least(coalesce(p_as_of_date, v_today), v_today);

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
      p_season_id is not null
      and season.id = p_season_id
    ) or (
      p_season_id is null
      and season.starts_on <= v_target_date
      and (season.ends_on is null or v_target_date < season.ends_on)
    )
    order by scope.server, season.starts_on desc
  ),
  selected_periods as (
    select
      'season'::text as period_kind,
      season.server,
      season.season_id,
      snapshot.snapshot_date,
      null::date as week_start,
      season.starts_on as period_start,
      least(
        snapshot.snapshot_date + 1,
        coalesce(season.ends_on, snapshot.snapshot_date + 1)
      ) as period_end_exclusive
    from selected_seasons season
    join lateral (
      select candidate.snapshot_date
      from public.zvz_season_snapshots candidate
      where candidate.season_id = season.season_id
        and candidate.snapshot_date <= least(
          greatest(v_target_date, season.starts_on),
          coalesce(season.ends_on - 1, v_target_date)
        )
      order by candidate.snapshot_date desc
      limit 1
    ) snapshot on true
  ),
  weekly_periods as (
    select
      'week'::text as period_kind,
      scope.server,
      null::uuid as season_id,
      null::date as snapshot_date,
      weekly.week_start,
      weekly.week_start as period_start,
      weekly.week_start + 7 as period_end_exclusive
    from server_scope scope
    join lateral (
      select rollup.week_start
      from public.guild_weekly_zvz_rollups rollup
      where rollup.albion_server = scope.server
        and rollup.week_start <= date_trunc('week', v_target_date)::date
      group by rollup.week_start
      order by rollup.week_start desc
      limit 1
    ) weekly on true
    where p_season_id is null
      and not exists (
        select 1
        from selected_periods selected
        where selected.server = scope.server
      )
  ),
  guild_matches as (
    select
      period.period_kind,
      period.server,
      period.season_id,
      period.snapshot_date,
      period.week_start,
      'guild'::text as entity_kind,
      rollup.guild_albion_id as albion_id,
      rollup.guild_name as entity_name,
      rollup.alliance_name,
      rollup.division,
      rollup.rank,
      rollup.zvz_battles as battle_count,
      1::integer as related_guild_count,
      rollup.latest_battle_at,
      rollup.tenant_slug,
      rollup.tenant_profile_enabled,
      case
        when lower(rollup.guild_name) = lower(v_query)
          or lower(rollup.guild_albion_id) = lower(v_query) then 0
        when left(lower(rollup.guild_name), char_length(v_query)) = lower(v_query)
          or left(lower(rollup.guild_albion_id), char_length(v_query)) = lower(v_query)
          then 1
        else 2
      end as relevance
    from selected_periods period
    join public.guild_season_zvz_rollups rollup
      on rollup.season_id = period.season_id
     and rollup.snapshot_date = period.snapshot_date
     and rollup.albion_server = period.server
    where position(lower(v_query) in lower(rollup.guild_name)) > 0
       or position(lower(v_query) in lower(rollup.guild_albion_id)) > 0

    union all

    select
      period.period_kind,
      period.server,
      period.season_id,
      period.snapshot_date,
      period.week_start,
      'guild'::text as entity_kind,
      rollup.guild_albion_id as albion_id,
      rollup.guild_name as entity_name,
      rollup.alliance_name,
      rollup.division,
      rollup.rank,
      rollup.zvz_battles as battle_count,
      1::integer as related_guild_count,
      rollup.latest_battle_at,
      rollup.tenant_slug,
      rollup.tenant_profile_enabled,
      case
        when lower(rollup.guild_name) = lower(v_query)
          or lower(rollup.guild_albion_id) = lower(v_query) then 0
        when left(lower(rollup.guild_name), char_length(v_query)) = lower(v_query)
          or left(lower(rollup.guild_albion_id), char_length(v_query)) = lower(v_query)
          then 1
        else 2
      end as relevance
    from weekly_periods period
    join public.guild_weekly_zvz_rollups rollup
      on rollup.week_start = period.week_start
     and rollup.albion_server = period.server
    where position(lower(v_query) in lower(rollup.guild_name)) > 0
       or position(lower(v_query) in lower(rollup.guild_albion_id)) > 0
  ),
  force_periods as (
    select * from selected_periods
    union all
    select * from weekly_periods
  ),
  alliance_rows as (
    select
      period.period_kind,
      period.server,
      period.season_id,
      period.snapshot_date,
      period.week_start,
      evidence.alliance_albion_id as albion_id,
      coalesce(
        (array_agg(
          nullif(btrim(evidence.alliance_name), '')
          order by evidence.battle_started_at desc, evidence.battle_record_id desc
        ) filter (where nullif(btrim(evidence.alliance_name), '') is not null))[1],
        evidence.alliance_albion_id
      ) as entity_name,
      count(distinct evidence.battle_record_id)::integer as battle_count,
      count(distinct member.guild_id)::integer as related_guild_count,
      max(evidence.battle_started_at) as latest_battle_at,
      bool_or(
        position(lower(v_query) in lower(coalesce(evidence.alliance_name, ''))) > 0
      ) or position(lower(v_query) in lower(evidence.alliance_albion_id)) > 0
        as matches
    from force_periods period
    join public.public_zvz_force_battle_evidence evidence
      on evidence.albion_server = period.server
     and evidence.battle_started_at >= (
       period.period_start::timestamp at time zone 'UTC'
     )
     and evidence.battle_started_at < (
       period.period_end_exclusive::timestamp at time zone 'UTC'
     )
    left join lateral unnest(evidence.guild_ids) member(guild_id) on true
    where evidence.alliance_albion_id is not null
    group by
      period.period_kind,
      period.server,
      period.season_id,
      period.snapshot_date,
      period.week_start,
      evidence.alliance_albion_id
  ),
  alliance_matches as (
    select
      alliance.period_kind,
      alliance.server,
      alliance.season_id,
      alliance.snapshot_date,
      alliance.week_start,
      'alliance'::text as entity_kind,
      alliance.albion_id,
      alliance.entity_name,
      null::text as alliance_name,
      null::text as division,
      null::integer as rank,
      alliance.battle_count,
      alliance.related_guild_count,
      alliance.latest_battle_at,
      null::text as tenant_slug,
      false as tenant_profile_enabled,
      case
        when lower(alliance.entity_name) = lower(v_query)
          or lower(alliance.albion_id) = lower(v_query) then 0
        when left(lower(alliance.entity_name), char_length(v_query)) = lower(v_query)
          or left(lower(alliance.albion_id), char_length(v_query)) = lower(v_query)
          then 1
        else 2
      end as relevance
    from alliance_rows alliance
    where alliance.matches
  ),
  entity_matches as (
    select * from guild_matches
    union all
    select * from alliance_matches
  )
  select
    matched.period_kind,
    matched.server,
    matched.season_id,
    matched.snapshot_date,
    matched.week_start,
    matched.entity_kind,
    matched.albion_id,
    matched.entity_name,
    matched.alliance_name,
    matched.division,
    matched.rank,
    matched.battle_count,
    matched.related_guild_count,
    matched.latest_battle_at,
    matched.tenant_slug,
    matched.tenant_profile_enabled
  from entity_matches matched
  order by
    matched.relevance,
    case matched.entity_kind when 'guild' then 0 else 1 end,
    lower(matched.entity_name),
    matched.server
  limit v_limit;
end;
$$;

revoke all on function public.search_public_zvz_entities(
  text,
  text,
  uuid,
  date,
  integer
) from public, anon, authenticated;
grant execute on function public.search_public_zvz_entities(
  text,
  text,
  uuid,
  date,
  integer
) to service_role;

comment on function public.search_public_zvz_entities(
  text,
  text,
  uuid,
  date,
  integer
) is
  'Searches scored guilds and complete official-fight alliance records in the same season snapshot or weekly fallback used by AGM Battles.';
