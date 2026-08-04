-- 367: Searchable public guild/alliance battle records.
--
-- Search resolves the same season snapshot (or weekly fallback) used by the
-- public board, but returns only public tenant-neutral ranking evidence. The
-- application links each result to the existing guild/alliance record pages.

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
      null::date as week_start
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
      weekly.week_start
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
      count(distinct evidence.guild_albion_id)::integer as related_guild_count,
      max(evidence.battle_started_at) as latest_battle_at,
      bool_or(
        position(lower(v_query) in lower(coalesce(evidence.alliance_name, ''))) > 0
      ) or position(lower(v_query) in lower(evidence.alliance_albion_id)) > 0
        as matches
    from selected_periods period
    join public.guild_season_zvz_battle_evidence evidence
      on evidence.season_id = period.season_id
     and evidence.albion_server = period.server
     and evidence.evidence_date <= period.snapshot_date
    where evidence.alliance_albion_id is not null
    group by
      period.period_kind,
      period.server,
      period.season_id,
      period.snapshot_date,
      period.week_start,
      evidence.alliance_albion_id

    union all

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
      count(distinct evidence.guild_albion_id)::integer as related_guild_count,
      max(evidence.battle_started_at) as latest_battle_at,
      bool_or(
        position(lower(v_query) in lower(coalesce(evidence.alliance_name, ''))) > 0
      ) or position(lower(v_query) in lower(evidence.alliance_albion_id)) > 0
        as matches
    from weekly_periods period
    join public.guild_weekly_zvz_battle_evidence evidence
      on evidence.week_start = period.week_start
     and evidence.albion_server = period.server
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
  matches as (
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
  from matches matched
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
  'Searches tenant-neutral public guild and alliance battle records in the same season snapshot or weekly fallback used by AGM Battles.';
