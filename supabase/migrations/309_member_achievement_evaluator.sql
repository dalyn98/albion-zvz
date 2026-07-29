-- 309: Award idempotent member achievements from official battle projections
-- and make guild weapon composition use the shared observed-equipment rule.

create or replace function public.evaluate_member_achievements(
  p_guild_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_step integer := 0;
begin
  if p_guild_id is null then
    raise exception 'GUILD_ID_REQUIRED';
  end if;

  -- Every confirmed participant receives the same repeatable team feat for the
  -- same official stat_unit_id. Ambiguous/excluded/legacy units cannot enter
  -- because is_engagement must be true.
  insert into public.member_achievements (
    guild_id,
    discord_id,
    achievement_key,
    track,
    definition_version,
    evidence_type,
    evidence_id,
    evidence,
    earned_at
  )
  select
    unit.guild_id,
    avatar.discord_id,
    feat.achievement_key,
    'team',
    1,
    'official_battle',
    unit.stat_unit_id::text,
    jsonb_build_object(
      'statUnitId', unit.stat_unit_id,
      'battleRecordId', unit.battle_record_id,
      'outcome', unit.outcome,
      'sizeCategory', unit.size_category,
      'homeSideTeamSize', unit.home_side_team_size,
      'opponentTeamSize', unit.opponent_team_size,
      'source', 'guild_battle_stat_units'
    ),
    coalesce(unit.ended_at, unit.started_at)
  from public.guild_battle_stat_units unit
  inner join public.guild_battle_stat_participations participation
    on participation.guild_id = unit.guild_id
   and participation.stat_unit_id = unit.stat_unit_id
  inner join public.guild_avatars avatar
    on avatar.guild_id = participation.guild_id
   and avatar.albion_player_id = participation.albion_player_id
   and avatar.withdrawn_at is null
  cross join lateral (
    values
      (
        'team_victory'::text,
        unit.outcome = 'win'
      ),
      (
        'team_large_battle'::text,
        unit.size_category in ('large', 'zerg')
      ),
      (
        'team_outnumbered_victory'::text,
        unit.outcome = 'win'
          and unit.home_side_team_size < unit.opponent_team_size
      )
  ) feat(achievement_key, earned)
  where unit.guild_id = p_guild_id
    and unit.is_engagement
    and feat.earned
  on conflict (guild_id, discord_id, achievement_key, evidence_id)
  do nothing;
  get diagnostics v_step = row_count;
  v_inserted := v_inserted + v_step;

  -- Participation milestones use only the confirmed participant set attached
  -- to ready/final official engagements.
  with ordered_participations as (
    select
      unit.guild_id,
      avatar.discord_id,
      unit.stat_unit_id,
      unit.battle_record_id,
      unit.started_at,
      row_number() over (
        partition by unit.guild_id, avatar.discord_id
        order by unit.started_at, unit.stat_unit_id
      )::integer as sequence
    from public.guild_battle_stat_units unit
    inner join public.guild_battle_stat_participations participation
      on participation.guild_id = unit.guild_id
     and participation.stat_unit_id = unit.stat_unit_id
    inner join public.guild_avatars avatar
      on avatar.guild_id = participation.guild_id
     and avatar.albion_player_id = participation.albion_player_id
     and avatar.withdrawn_at is null
    where unit.guild_id = p_guild_id
      and unit.is_engagement
  ),
  milestones(threshold) as (
    values (10), (50), (100), (300)
  )
  insert into public.member_achievements (
    guild_id,
    discord_id,
    achievement_key,
    track,
    definition_version,
    evidence_type,
    evidence_id,
    evidence,
    earned_at
  )
  select
    participation.guild_id,
    participation.discord_id,
    'individual_participation_' || milestone.threshold::text,
    'individual',
    1,
    'official_battle',
    participation.stat_unit_id::text,
    jsonb_build_object(
      'statUnitId', participation.stat_unit_id,
      'battleRecordId', participation.battle_record_id,
      'observedParticipations', milestone.threshold,
      'source', 'guild_battle_stat_participations'
    ),
    participation.started_at
  from ordered_participations participation
  inner join milestones milestone
    on milestone.threshold = participation.sequence
  on conflict (guild_id, discord_id, achievement_key, evidence_id)
  do nothing;
  get diagnostics v_step = row_count;
  v_inserted := v_inserted + v_step;

  -- Personal kill milestones are direct result-eligible killboard events. They
  -- recognize an observable fact only and do not imply role performance.
  with ordered_kills as (
    select
      event.guild_id,
      avatar.discord_id,
      event.event_id,
      event.stat_unit_id,
      event.battle_record_id,
      event.occurred_at,
      row_number() over (
        partition by event.guild_id, avatar.discord_id
        order by event.occurred_at, event.event_id, event.stat_unit_id
      )::integer as sequence
    from public.guild_battle_stat_events event
    inner join public.guild_avatars avatar
      on avatar.guild_id = event.guild_id
     and avatar.albion_player_id = event.albion_player_id
     and avatar.withdrawn_at is null
    where event.guild_id = p_guild_id
      and event.role = 'killer'
  ),
  milestones(threshold) as (
    values (10), (50), (200), (1000)
  )
  insert into public.member_achievements (
    guild_id,
    discord_id,
    achievement_key,
    track,
    definition_version,
    evidence_type,
    evidence_id,
    evidence,
    earned_at
  )
  select
    kill.guild_id,
    kill.discord_id,
    'individual_kill_' || milestone.threshold::text,
    'individual',
    1,
    'official_kill_event',
    kill.event_id::text,
    jsonb_build_object(
      'eventId', kill.event_id,
      'statUnitId', kill.stat_unit_id,
      'battleRecordId', kill.battle_record_id,
      'observedKills', milestone.threshold,
      'source', 'guild_battle_stat_events'
    ),
    kill.occurred_at
  from ordered_kills kill
  inner join milestones milestone
    on milestone.threshold = kill.sequence
  on conflict (guild_id, discord_id, achievement_key, evidence_id)
  do nothing;
  get diagnostics v_step = row_count;
  v_inserted := v_inserted + v_step;

  -- Deathless runs mean "no official victim event was observed for this
  -- confirmed participation". This is intentionally an auxiliary fact rather
  -- than an overall survival skill or cross-role grade.
  with death_events as (
    select
      event.guild_id,
      event.stat_unit_id,
      event.albion_player_id,
      true as had_observed_death
    from public.guild_battle_stat_events event
    where event.guild_id = p_guild_id
      and event.role = 'victim'
    group by event.guild_id, event.stat_unit_id, event.albion_player_id
  ),
  participation_rows as (
    select
      unit.guild_id,
      avatar.discord_id,
      participation.albion_player_id,
      unit.stat_unit_id,
      unit.battle_record_id,
      unit.started_at,
      coalesce(death.had_observed_death, false) as had_observed_death
    from public.guild_battle_stat_units unit
    inner join public.guild_battle_stat_participations participation
      on participation.guild_id = unit.guild_id
     and participation.stat_unit_id = unit.stat_unit_id
    inner join public.guild_avatars avatar
      on avatar.guild_id = participation.guild_id
     and avatar.albion_player_id = participation.albion_player_id
     and avatar.withdrawn_at is null
    left join death_events death
      on death.guild_id = participation.guild_id
     and death.stat_unit_id = participation.stat_unit_id
     and death.albion_player_id = participation.albion_player_id
    where unit.guild_id = p_guild_id
      and unit.is_engagement
  ),
  reset_groups as (
    select
      row.*,
      sum(case when row.had_observed_death then 1 else 0 end) over (
        partition by row.guild_id, row.discord_id
        order by row.started_at, row.stat_unit_id
        rows between unbounded preceding and current row
      ) as death_group
    from participation_rows row
  ),
  streaks as (
    select
      row.*,
      count(*) filter (where not row.had_observed_death) over (
        partition by row.guild_id, row.discord_id, row.death_group
        order by row.started_at, row.stat_unit_id
        rows between unbounded preceding and current row
      )::integer as deathless_sequence
    from reset_groups row
  ),
  milestones(threshold) as (
    values (5), (15), (30)
  )
  insert into public.member_achievements (
    guild_id,
    discord_id,
    achievement_key,
    track,
    definition_version,
    evidence_type,
    evidence_id,
    evidence,
    earned_at
  )
  select
    streak.guild_id,
    streak.discord_id,
    'individual_deathless_' || milestone.threshold::text,
    'individual',
    1,
    'official_battle',
    streak.stat_unit_id::text,
    jsonb_build_object(
      'statUnitId', streak.stat_unit_id,
      'battleRecordId', streak.battle_record_id,
      'deathlessSequence', milestone.threshold,
      'limitation', 'no_official_victim_event_observed',
      'source', 'guild_battle_stat_participations'
    ),
    streak.started_at
  from streaks streak
  inner join milestones milestone
    on milestone.threshold = streak.deathless_sequence
  where not streak.had_observed_death
  on conflict (guild_id, discord_id, achievement_key, evidence_id)
  do nothing;
  get diagnostics v_step = row_count;
  v_inserted := v_inserted + v_step;

  return v_inserted;
end;
$$;

revoke all on function public.evaluate_member_achievements(uuid)
  from public, anon, authenticated;
grant execute on function public.evaluate_member_achievements(uuid)
  to service_role;

-- Keep the legacy member-ranking RPC during the expand/application transition.
-- The new application reads member_achievements directly, but retaining this
-- function keeps the previous application release rollback-safe. It can be
-- removed in a later contract-only release after the new application has been
-- stable in production.


drop function if exists public.guild_top_weapon_categories(
  uuid,
  timestamptz,
  boolean,
  integer
);

create function public.guild_top_weapon_categories(
  p_guild_id uuid,
  p_cutoff timestamptz,
  p_bundle_splits boolean default false,
  p_limit integer default 5
)
returns table (
  category text,
  sample_item_id text,
  observation_count integer,
  sample_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
      from public.guild_battle_stat_units unit
     where unit.guild_id = p_guild_id
       and unit.started_at >= p_cutoff
  ),
  direct_units as (
    select *
      from scoped unit
     where unit.is_engagement or not p_bundle_splits
  ),
  bundled_legacy as (
    select distinct on (unit.battle_record_id)
      unit.*
    from scoped unit
    where not unit.is_engagement
      and p_bundle_splits
    order by
      unit.battle_record_id,
      unit.main_opponent_team_size desc,
      unit.started_at desc,
      unit.stat_unit_id desc
  ),
  tracked as (
    select * from direct_units
    union all
    select * from bundled_legacy
  ),
  official_weapons as (
    select
      event.albion_player_id,
      event.occurred_at,
      'engagement:' || event.stat_unit_id::text as battle_key,
      event.equipment->'MainHand'->>'Type' as mainhand_type
    from public.guild_battle_stat_events event
    inner join tracked
      on tracked.is_engagement
     and tracked.guild_id = event.guild_id
     and tracked.stat_unit_id = event.stat_unit_id
    where event.discord_id is not null
      and event.albion_player_id is not null
  ),
  legacy_weapon_matches as (
    select
      event.event_id,
      event.role,
      event.albion_player_id,
      event.occurred_at,
      event.equipment->'MainHand'->>'Type' as mainhand_type,
      'legacy:' || tracked.stat_unit_id::text as battle_key,
      row_number() over (
        partition by event.event_id, event.role, event.albion_player_id
        order by tracked.started_at desc, tracked.stat_unit_id
      ) as match_rank
    from public.killboard_events event
    inner join tracked
      on not tracked.is_engagement
     and (
       (
         event.battle_id is not null
         and tracked.albion_battle_id is not null
         and event.battle_id = tracked.albion_battle_id
       )
       or (
         event.battle_id is null
         and event.occurred_at >= tracked.started_at - interval '15 minutes'
         and event.occurred_at <= tracked.ended_at + interval '15 minutes'
       )
     )
    where event.guild_id = p_guild_id
      and event.discord_id is not null
      and event.albion_player_id is not null
      and event.occurred_at >= p_cutoff
  ),
  matched_weapons as (
    select * from official_weapons
    union all
    select
      match.albion_player_id,
      match.occurred_at,
      match.battle_key,
      match.mainhand_type
    from legacy_weapon_matches match
    where match.match_rank = 1
  ),
  categorized as (
    select
      weapon.albion_player_id,
      weapon.observed_at,
      weapon.battle_key,
      weapon.mainhand_type,
      public.resolve_observed_weapon_category(weapon.mainhand_type) as category
    from (
      select
        matched.albion_player_id,
        matched.occurred_at as observed_at,
        matched.battle_key,
        matched.mainhand_type
      from matched_weapons matched
    ) weapon
    where weapon.mainhand_type is not null
  ),
  deduplicated as (
    select
      categorized.albion_player_id,
      categorized.category,
      categorized.battle_key,
      (
        array_agg(
          categorized.mainhand_type
          order by categorized.observed_at desc, categorized.mainhand_type desc
        )
      )[1] as sample_item_id,
      max(categorized.observed_at) as latest_observed_at
    from categorized
    where categorized.category is not null
    group by
      categorized.albion_player_id,
      categorized.category,
      categorized.battle_key
  )
  select
    deduplicated.category,
    (
      array_agg(
        deduplicated.sample_item_id
        order by deduplicated.latest_observed_at desc, deduplicated.sample_item_id desc
      )
    )[1] as sample_item_id,
    count(*)::integer as observation_count,
    sum(count(*)) over ()::integer as sample_count
  from deduplicated
  group by deduplicated.category
  order by count(*) desc, deduplicated.category asc
  limit greatest(0, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.guild_top_weapon_categories(
  uuid,
  timestamptz,
  boolean,
  integer
) from public, anon, authenticated;
grant execute on function public.guild_top_weapon_categories(
  uuid,
  timestamptz,
  boolean,
  integer
) to service_role;

notify pgrst, 'reload schema';
