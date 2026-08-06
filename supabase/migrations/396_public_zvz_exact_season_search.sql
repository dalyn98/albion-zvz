-- Keep tenant-neutral entity search on the same exact season window as the
-- ranking board. The query remains date-based because snapshots are daily.

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
      bounds.starts_on,
      bounds.starts_at,
      bounds.last_snapshot_date,
      case
        when bounds.last_snapshot_date is null then null
        else bounds.last_snapshot_date + 1
      end as ends_on
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
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
      and (p_as_of_date is not null or season.starts_at <= clock_timestamp())
    )
    order by scope.server, season.starts_at desc
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

revoke all on function public.search_public_zvz_entities(
  text, text, uuid, date, integer
) from public, anon, authenticated;
grant execute on function public.search_public_zvz_entities(
  text, text, uuid, date, integer
) to service_role;
