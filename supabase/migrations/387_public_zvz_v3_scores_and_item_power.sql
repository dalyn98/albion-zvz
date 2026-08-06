-- Ranking v3 reduces the dominant mobilization component, adds observed
-- per-player combat efficiency, and carries sampled average item power.

alter table public.public_zvz_entity_engagement_evidence
  add column average_item_power numeric(10, 2),
  add column item_power_sample_count integer not null default 0;

alter table public.public_zvz_entity_engagement_evidence
  add constraint public_zvz_entity_evidence_item_power_check check (
    (item_power_sample_count = 0 and average_item_power is null)
    or (item_power_sample_count > 0 and average_item_power > 0)
  );

alter table public.public_zvz_v2_season_evidence
  add column average_item_power numeric(10, 2),
  add column item_power_sample_count integer not null default 0;

alter table public.public_zvz_v2_season_evidence
  add constraint public_zvz_season_evidence_item_power_check check (
    (item_power_sample_count = 0 and average_item_power is null)
    or (item_power_sample_count > 0 and average_item_power > 0)
  );

alter table public.public_zvz_v2_season_rollups
  add column efficiency_index numeric(18, 6) not null default 0
    check (efficiency_index >= 0),
  add column efficiency_points numeric(18, 6) not null default 0
    check (efficiency_points between 0 and 150),
  add column average_item_power numeric(10, 2),
  add column item_power_sample_count integer not null default 0;

alter table public.public_zvz_v2_season_rollups
  add constraint public_zvz_rollup_item_power_check check (
    (item_power_sample_count = 0 and average_item_power is null)
    or (item_power_sample_count > 0 and average_item_power > 0)
  );

alter table public.public_zvz_v2_season_rollups
  alter column score_formula_version set default 'agm_zvz_v3',
  drop constraint if exists public_zvz_v2_season_rollups_score_formula_version_check,
  add constraint public_zvz_v2_season_rollups_score_formula_version_check
    check (score_formula_version in ('agm_zvz_v2', 'agm_zvz_v3'));

comment on column public.public_zvz_entity_engagement_evidence.average_item_power is
  'Average IP of directly observed players with known IP for this entity in this engagement; missing IP is excluded.';
comment on column public.public_zvz_v2_season_rollups.efficiency_index is
  'Average non-negative combat contribution per deployed member with a bounded full-side matchup difficulty adjustment.';
comment on column public.public_zvz_v2_season_rollups.average_item_power is
  'Sample-count-weighted average of known observed player IP across included engagements.';

create or replace function public.apply_public_zvz_battle_item_power(
  p_battle_record_id uuid,
  p_source_hash text,
  p_engagements jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engagement jsonb;
  v_evidence jsonb;
  v_average numeric;
  v_sample_count integer;
  v_updated integer := 0;
  v_row_count integer;
begin
  if jsonb_typeof(p_engagements) <> 'array' then
    raise exception 'engagement projection must be an array';
  end if;
  if not exists (
    select 1
    from public.battle_records battle
    where battle.id = p_battle_record_id
      and battle.engagement_source_hash = p_source_hash
  ) then
    raise exception 'stale battle item power projection';
  end if;

  for v_engagement in
    select value from jsonb_array_elements(p_engagements)
  loop
    for v_evidence in
      select value
      from jsonb_array_elements(coalesce(v_engagement->'evidence', '[]'::jsonb))
    loop
      v_sample_count := coalesce(
        nullif(v_evidence->>'itemPowerSampleCount', '')::integer,
        0
      );
      v_average := nullif(v_evidence->>'averageItemPower', '')::numeric;
      if v_sample_count < 0
         or (v_sample_count = 0 and v_average is not null)
         or (v_sample_count > 0 and coalesce(v_average, 0) <= 0) then
        raise exception 'invalid item power evidence';
      end if;

      update public.public_zvz_entity_engagement_evidence target
         set average_item_power = round(v_average, 2),
             item_power_sample_count = v_sample_count
        from public.public_zvz_engagements engagement
       where target.engagement_id = engagement.id
         and engagement.battle_record_id = p_battle_record_id
         and engagement.source_hash = p_source_hash
         and engagement.engagement_key = v_engagement->>'engagementKey'
         and target.entity_kind = v_evidence->>'entityKind'
         and target.entity_albion_id = v_evidence->>'entityAlbionId';
      get diagnostics v_row_count = row_count;
      v_updated := v_updated + v_row_count;
    end loop;
  end loop;
  return v_updated;
end;
$$;

revoke all on function public.apply_public_zvz_battle_item_power(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_public_zvz_battle_item_power(uuid, text, jsonb)
  to service_role;

comment on function public.apply_public_zvz_battle_item_power(uuid, text, jsonb) is
  'Applies source-hash-guarded observed IP samples immediately after canonical battle projection replacement.';

create or replace function public.inherit_public_zvz_frozen_item_power()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select
    source.average_item_power,
    source.item_power_sample_count
  into
    new.average_item_power,
    new.item_power_sample_count
  from public.public_zvz_entity_engagement_evidence source
  where source.engagement_id = new.engagement_id
    and source.entity_kind = new.entity_kind
    and source.entity_albion_id = new.entity_albion_id;

  if not found then
    new.average_item_power := null;
    new.item_power_sample_count := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.inherit_public_zvz_frozen_item_power()
  from public, anon, authenticated;

drop trigger if exists trg_inherit_public_zvz_frozen_item_power
  on public.public_zvz_v2_season_evidence;
create trigger trg_inherit_public_zvz_frozen_item_power
before insert on public.public_zvz_v2_season_evidence
for each row execute function public.inherit_public_zvz_frozen_item_power();

create or replace function public.rebuild_public_zvz_v3_rollups(
  p_season_id uuid,
  p_snapshot_dates date[]
)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
declare
  v_server text;
  v_rollup_rows integer := 0;
  v_previous_guard text := current_setting(
    'agm.rebuilding_comparable_scale_rollups',
    true
  );
begin
  if coalesce(cardinality(p_snapshot_dates), 0) = 0 then
    return 0;
  end if;

  select season.albion_server
    into v_server
  from public.zvz_seasons season
  where season.id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-v2-season:' || p_season_id::text, 0)
  );
  perform set_config('agm.rebuilding_comparable_scale_rollups', '1', true);

  delete from public.public_zvz_v2_season_rollups rollup
   where rollup.season_id = p_season_id
     and rollup.snapshot_date = any(p_snapshot_dates);

  with snapshot_days as (
    select snapshot.snapshot_date
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = p_season_id
      and snapshot.snapshot_date = any(p_snapshot_dates)
  ),
  expanded as (
    select
      day.snapshot_date,
      evidence.*,
      scope.value as scope,
      greatest(
        0::numeric,
        evidence.kills * 3
          + greatest(evidence.kills - evidence.deaths, 0) * 2
          + evidence.kill_fame::numeric / 500000
          - greatest(evidence.deaths - evidence.kills, 0) * 0.5
      ) as combat_contribution
    from snapshot_days day
    join public.public_zvz_v2_season_evidence evidence
      on evidence.season_id = p_season_id
     and evidence.evidence_date <= day.snapshot_date
    cross join lateral (
      select 'overall'::text as value
      union all
      select evidence.scale
      where least(evidence.side_team_size, evidence.opponent_side_team_size) * 4
        >= greatest(evidence.side_team_size, evidence.opponent_side_team_size) * 3
    ) scope
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
      round(avg(ordered.combat_contribution), 6) as combat_index,
      round(avg(
        ordered.combat_contribution
          / greatest(ordered.own_team_size, 1)
          * least(
            1.25::numeric,
            greatest(
              0.75::numeric,
              sqrt(
                ordered.opponent_side_team_size::numeric
                  / greatest(ordered.side_team_size, 1)
              )
            )
          )
      ), 6) as efficiency_index,
      round(sum(ordered.battle_points), 6) as battle_points,
      round(
        sum(ordered.average_item_power * ordered.item_power_sample_count)
          filter (where ordered.item_power_sample_count > 0)
          / nullif(
              sum(ordered.item_power_sample_count)
                filter (where ordered.item_power_sample_count > 0),
              0
            ),
        2
      ) as average_item_power,
      coalesce(sum(ordered.item_power_sample_count), 0)::integer
        as item_power_sample_count,
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
          then 350::numeric * least(1::numeric, enriched.representative_size / 100)
        else 0::numeric
      end as size_points,
      case
        when enriched.combat_index <= 0 then 0::numeric
        when enriched.scope = 'overall'
          then 350::numeric * enriched.combat_index / (enriched.combat_index + 30)
        else 700::numeric * enriched.combat_index / (enriched.combat_index + 30)
      end as combat_points,
      case
        when enriched.scope = 'overall' and enriched.efficiency_index > 0
          then 150::numeric * enriched.efficiency_index
            / (enriched.efficiency_index + 1)
        else 0::numeric
      end as efficiency_points,
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
          + components.efficiency_points
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
    efficiency_index,
    battle_points,
    size_points,
    combat_points,
    efficiency_points,
    activity_points,
    average_item_power,
    item_power_sample_count,
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
    ranked.efficiency_index,
    ranked.battle_points,
    round(ranked.size_points, 6),
    round(ranked.combat_points, 6),
    round(ranked.efficiency_points, 6),
    round(ranked.activity_points, 6),
    ranked.average_item_power,
    ranked.item_power_sample_count,
    ranked.score,
    ranked.rank,
    ranked.sample_status,
    ranked.latest_battle_at,
    'agm_zvz_v3',
    clock_timestamp()
  from ranked;

  get diagnostics v_rollup_rows = row_count;
  perform set_config(
    'agm.rebuilding_comparable_scale_rollups',
    coalesce(v_previous_guard, ''),
    true
  );
  return v_rollup_rows;
exception
  when others then
    perform set_config(
      'agm.rebuilding_comparable_scale_rollups',
      coalesce(v_previous_guard, ''),
      true
    );
    raise;
end;
$$;

revoke all on function public.rebuild_public_zvz_v3_rollups(uuid, date[])
  from public, anon, authenticated;
grant execute on function public.rebuild_public_zvz_v3_rollups(uuid, date[])
  to service_role;

comment on function public.rebuild_public_zvz_v3_rollups(uuid, date[]) is
  'Rebuilds overall v3 rankings and comparable scale-only rankings from one frozen evidence set.';

create or replace function public.enforce_public_zvz_v2_comparable_scale_rollups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
begin
  if current_setting('agm.rebuilding_comparable_scale_rollups', true) = '1' then
    return null;
  end if;

  for v_batch in
    select
      inserted.season_id,
      array_agg(
        distinct inserted.snapshot_date
        order by inserted.snapshot_date
      ) as snapshot_dates
    from inserted_public_zvz_rollups inserted
    group by inserted.season_id
  loop
    perform public.rebuild_public_zvz_v3_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
  return null;
end;
$$;

comment on function public.enforce_public_zvz_v2_comparable_scale_rollups() is
  'Atomically replaces temporary v2 publication rows with overall and comparable-scale v3 rollups.';
