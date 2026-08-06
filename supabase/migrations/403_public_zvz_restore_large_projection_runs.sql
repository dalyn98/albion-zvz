-- Migration 402 deliberately invalidated current-season projection runs, but
-- the Small rule only expands the candidate set below 40 total players.
-- Restore 40+ checkpoints from preserved projections so backfill remains
-- focused on newly eligible 10-v-10 through 20-v-20 source battles.

update public.public_zvz_engagements engagement
set qualification_version = 'agm_zvz_v2_small10_comp75'
where engagement.qualification_version is distinct from
  'agm_zvz_v2_small10_comp75';

with current_battles as (
  select
    battle.id,
    battle.engagement_source_hash,
    battle.total_kills,
    exists (
      select 1
      from public.battle_force_summaries home
      where home.battle_record_id = battle.id
        and home.force_level = 'alliance'
        and home.team_size >= 20
        and (
          select coalesce(sum(opponent.team_size), 0)
          from public.battle_force_summaries opponent
          where opponent.battle_record_id = battle.id
            and opponent.force_level = 'alliance'
            and opponent.force_key <> home.force_key
        ) >= 20
    ) as is_candidate
  from public.battle_records battle
  where battle.total_players >= 40
    and battle.engagement_source_hash is not null
    and exists (
      select 1
      from public.zvz_seasons season
      cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
      where season.albion_server = battle.albion_server
        and bounds.starts_at <= clock_timestamp()
        and (bounds.ends_at is null or clock_timestamp() < bounds.ends_at)
        and battle.started_at >= bounds.starts_at
        and (bounds.ends_at is null or battle.started_at < bounds.ends_at)
    )
),
engagement_state as (
  select
    engagement.battle_record_id,
    count(*)::integer as engagement_count,
    case
      when bool_or(engagement.coverage = 'unavailable') then 'unavailable'
      when bool_or(engagement.coverage = 'partial') then 'partial'
      else 'complete'
    end as coverage
  from public.public_zvz_engagements engagement
  join current_battles battle on battle.id = engagement.battle_record_id
  group by engagement.battle_record_id
),
restored as (
  select
    battle.id as battle_record_id,
    battle.engagement_source_hash as source_hash,
    coalesce(
      engagement.coverage,
      case when battle.is_candidate then 'partial' else 'complete' end
    ) as coverage,
    battle.is_candidate,
    case
      when engagement.coverage = 'complete' then battle.total_kills
      else 0
    end as observed_event_count,
    battle.total_kills as expected_event_count,
    coalesce(engagement.engagement_count, 0) as engagement_count
  from current_battles battle
  left join engagement_state engagement
    on engagement.battle_record_id = battle.id
)
insert into public.public_zvz_battle_projection_runs (
  battle_record_id,
  source_hash,
  coverage,
  is_candidate,
  observed_event_count,
  expected_event_count,
  engagement_count,
  projected_at
)
select
  restored.battle_record_id,
  restored.source_hash,
  restored.coverage,
  restored.is_candidate,
  restored.observed_event_count,
  restored.expected_event_count,
  restored.engagement_count,
  case
    when restored.coverage = 'complete' then clock_timestamp()
    else clock_timestamp() - interval '7 hours'
  end
from restored
on conflict (battle_record_id) do nothing;
