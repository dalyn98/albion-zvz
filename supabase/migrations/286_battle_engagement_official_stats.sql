-- 286: Make finalized engagements the official source for result-based stats.
--
-- A projected raw battle never falls back to its legacy outcome while its
-- engagement run is collecting, ambiguous, blocked, or insufficient. Historical
-- battles without an engagement run keep the legacy path until they are
-- backfilled. This prevents a stale fame-only result from leaking into stats.

create or replace view public.guild_battle_stat_units
with (security_invoker = true)
as
with official_matchups as (
  select
    matchup.guild_id,
    matchup.engagement_id,
    coalesce(sum(matchup.opponent_team_size), 0)::integer as opponent_team_size,
    (array_agg(
      matchup.force_name
      order by matchup.event_count desc, matchup.force_key asc
    ))[1] as primary_opponent_name,
    (array_agg(
      matchup.opponent_team_size
      order by matchup.event_count desc, matchup.force_key asc
    ))[1] as primary_opponent_team_size
  from public.battle_engagement_matchups matchup
  where matchup.matchup_role = 'result_eligible'
  group by matchup.guild_id, matchup.engagement_id
),
official as (
  select
    engagement.engagement_id as stat_unit_id,
    engagement.tenant_id as guild_id,
    engagement.home_guild_id,
    engagement.battle_record_id,
    engagement.started_at,
    engagement.ended_at,
    engagement.albion_battle_id,
    case
      when engagement.result = 'advantage' then 'win'
      when engagement.result = 'disadvantage' then 'loss'
      else 'tie'
    end::text as outcome,
    engagement.result_home_kills::integer as home_kills,
    engagement.result_home_deaths::integer as home_deaths,
    engagement.result_home_kill_fame::bigint as home_kill_fame,
    engagement.result_opponent_kills::integer as opponent_kills,
    engagement.result_opponent_deaths::integer as opponent_deaths,
    engagement.result_opponent_kill_fame::bigint as opponent_kill_fame,
    engagement.home_team_size::integer as home_team_size,
    engagement.home_side_team_size::integer as home_side_team_size,
    coalesce(matchups.opponent_team_size, 0)::integer as opponent_team_size,
    coalesce(matchups.primary_opponent_team_size, 0)::integer
      as main_opponent_team_size,
    matchups.primary_opponent_name,
    case
      when greatest(
        engagement.home_side_team_size,
        coalesce(matchups.opponent_team_size, 0)
      ) <= 30 then 'small'
      when greatest(
        engagement.home_side_team_size,
        coalesce(matchups.opponent_team_size, 0)
      ) <= 60 then 'middle'
      when greatest(
        engagement.home_side_team_size,
        coalesce(matchups.opponent_team_size, 0)
      ) <= 100 then 'large'
      else 'zerg'
    end::text as size_category,
    true as is_engagement,
    engagement.run_id,
    engagement.sequence::integer as engagement_sequence
  from public.guild_battle_engagements engagement
  left join official_matchups matchups
    on matchups.guild_id = engagement.tenant_id
   and matchups.engagement_id = engagement.engagement_id
  where engagement.run_state = 'ready'
    and engagement.status = 'final'
    and engagement.result is not null
    and engagement.engagement_id is not null
),
legacy as (
  select
    record.id as stat_unit_id,
    record.guild_id,
    record.home_guild_id,
    record.battle_record_id,
    record.started_at,
    battle.ended_at,
    battle.albion_battle_id,
    record.outcome,
    coalesce(record.home_kills, 0)::integer as home_kills,
    coalesce(record.home_deaths, 0)::integer as home_deaths,
    coalesce(record.home_kill_fame, 0)::bigint as home_kill_fame,
    coalesce(record.opponent_kills, 0)::integer as opponent_kills,
    coalesce(record.opponent_deaths, 0)::integer as opponent_deaths,
    coalesce(record.opponent_kill_fame, 0)::bigint as opponent_kill_fame,
    coalesce(record.home_team_size, 0)::integer as home_team_size,
    coalesce(record.home_team_size, 0)::integer as home_side_team_size,
    coalesce(record.opponent_team_size, 0)::integer as opponent_team_size,
    coalesce(record.main_opponent_team_size, 0)::integer
      as main_opponent_team_size,
    record.primary_opponent_name,
    record.size_category,
    false as is_engagement,
    null::uuid as run_id,
    null::integer as engagement_sequence
  from public.tenant_zvz_battle_records record
  inner join public.battle_records battle
    on battle.id = record.battle_record_id
  where battle.ended_at is not null
    and not exists (
      select 1
        from public.battle_engagement_runs run
       where run.guild_id = record.guild_id
         and run.battle_record_id = record.battle_record_id
    )
)
select * from official
union all
select * from legacy;

revoke all on public.guild_battle_stat_units from public, anon, authenticated;
grant select on public.guild_battle_stat_units to service_role;

comment on view public.guild_battle_stat_units is
  '확정 engagement 또는 아직 projection되지 않은 legacy battle만 노출하는 공식 통계 단위.';


create or replace view public.guild_battle_stat_events
with (security_invoker = true)
as
select
  unit.guild_id,
  unit.stat_unit_id,
  unit.battle_record_id,
  unit.started_at,
  unit.outcome,
  link.event_id,
  link.role,
  event.albion_player_id,
  event.discord_id,
  event.occurred_at,
  event.fame,
  event.equipment
from public.guild_battle_stat_units unit
inner join public.battle_engagement_event_links link
  on unit.is_engagement
 and link.guild_id = unit.guild_id
 and link.engagement_id = unit.stat_unit_id
 and link.classification = 'result_eligible'
inner join public.killboard_events event
  on event.guild_id = link.guild_id
 and event.event_id = link.event_id
 and event.role = link.role;

revoke all on public.guild_battle_stat_events from public, anon, authenticated;
grant select on public.guild_battle_stat_events to service_role;

comment on view public.guild_battle_stat_events is
  '공식 engagement 결과에 포함된 직접 event만 노출. 개입·기타·식별불가는 제외.';


create or replace view public.guild_battle_stat_participations
with (security_invoker = true)
as
with single_official_engagement as (
  select
    run.guild_id,
    run.battle_record_id,
    engagement.id as stat_unit_id
  from public.battle_engagement_runs run
  inner join public.battle_records battle
    on battle.id = run.battle_record_id
   and battle.engagement_source_hash = run.source_hash
  inner join public.battle_engagements engagement
    on engagement.guild_id = run.guild_id
   and engagement.run_id = run.id
  where run.state = 'ready'
    and engagement.status = 'final'
    and engagement.result is not null
    and not exists (
      select 1
        from public.battle_engagements sibling
       where sibling.guild_id = engagement.guild_id
         and sibling.run_id = engagement.run_id
         and sibling.id <> engagement.id
    )
),
official_raw as (
  select
    unit.guild_id,
    unit.stat_unit_id,
    unit.battle_record_id,
    member.albion_player_id,
    unit.started_at,
    unit.outcome
  from single_official_engagement single_engagement
  inner join public.guild_battle_stat_units unit
    on unit.guild_id = single_engagement.guild_id
   and unit.battle_record_id = single_engagement.battle_record_id
   and unit.stat_unit_id = single_engagement.stat_unit_id
  inner join public.battle_records battle
    on battle.id = unit.battle_record_id
  cross join lateral jsonb_each(battle.raw_battle->'players') player
  inner join public.albion_guild_members member
    on member.guild_id = unit.guild_id
   and member.albion_player_id = player.value->>'id'
   and member.left_at is null
  where player.value->>'guildId' = unit.home_guild_id
),
official_events as (
  select
    event.guild_id,
    event.stat_unit_id,
    event.battle_record_id,
    member.albion_player_id,
    event.started_at,
    event.outcome
  from public.guild_battle_stat_events event
  inner join public.albion_guild_members member
    on member.guild_id = event.guild_id
   and member.albion_player_id = event.albion_player_id
   and member.left_at is null
),
legacy_raw as (
  select
    unit.guild_id,
    unit.stat_unit_id,
    unit.battle_record_id,
    member.albion_player_id,
    unit.started_at,
    unit.outcome
  from public.guild_battle_stat_units unit
  inner join public.battle_records battle
    on battle.id = unit.battle_record_id
  cross join lateral jsonb_each(battle.raw_battle->'players') player
  inner join public.albion_guild_members member
    on member.guild_id = unit.guild_id
   and member.albion_player_id = player.value->>'id'
   and member.left_at is null
  where not unit.is_engagement
    and player.value->>'guildId' = unit.home_guild_id
)
select distinct * from official_raw
union
select distinct * from official_events
union
select distinct * from legacy_raw;

revoke all on public.guild_battle_stat_participations
  from public, anon, authenticated;
grant select on public.guild_battle_stat_participations to service_role;

comment on view public.guild_battle_stat_participations is
  '단일 engagement는 raw 참여자를 보존하고, 다중 engagement는 직접 event가 있는 멤버만 귀속.';


create or replace function public.guild_battle_rollup(
  p_guild_id uuid,
  p_since timestamptz default null,
  p_bundle_splits boolean default false
)
returns table (
  battle_count integer,
  win_count integer,
  loss_count integer,
  tie_count integer,
  total_kills bigint,
  total_deaths bigint
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
       and (p_since is null or unit.started_at >= p_since)
  ),
  direct_units as (
    select
      unit.stat_unit_id,
      unit.battle_record_id,
      unit.outcome,
      unit.home_kills,
      unit.home_deaths
    from scoped unit
    where unit.is_engagement or not p_bundle_splits
  ),
  bundled_legacy as (
    select distinct on (unit.battle_record_id)
      unit.stat_unit_id,
      unit.battle_record_id,
      unit.outcome,
      sum(unit.home_kills) over (partition by unit.battle_record_id)::integer
        as home_kills,
      sum(unit.home_deaths) over (partition by unit.battle_record_id)::integer
        as home_deaths
    from scoped unit
    where not unit.is_engagement
      and p_bundle_splits
    order by
      unit.battle_record_id,
      unit.main_opponent_team_size desc,
      unit.started_at desc,
      unit.stat_unit_id desc
  ),
  evaluated as (
    select * from direct_units
    union all
    select * from bundled_legacy
  )
  select
    count(*)::integer as battle_count,
    count(*) filter (where outcome = 'win')::integer as win_count,
    count(*) filter (where outcome = 'loss')::integer as loss_count,
    count(*) filter (where outcome = 'tie')::integer as tie_count,
    coalesce(sum(home_kills), 0)::bigint as total_kills,
    coalesce(sum(home_deaths), 0)::bigint as total_deaths
  from evaluated;
$$;

revoke all on function public.guild_battle_rollup(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.guild_battle_rollup(uuid, timestamptz, boolean)
  to service_role;


create or replace function public.guild_top_rivals(
  p_guild_id uuid,
  p_cutoff timestamptz,
  p_limit integer default 3
)
returns table (
  guild_name text,
  battle_count integer,
  wins integer,
  losses integer,
  ties integer
)
language sql
stable
security definer
set search_path = public
as $$
  with rival_rows as (
    select
      matchup.force_name as guild_name,
      unit.outcome
    from public.guild_battle_stat_units unit
    inner join public.battle_engagement_matchups matchup
      on unit.is_engagement
     and matchup.guild_id = unit.guild_id
     and matchup.engagement_id = unit.stat_unit_id
     and matchup.matchup_role = 'result_eligible'
    where unit.guild_id = p_guild_id
      and unit.started_at >= p_cutoff

    union all

    select
      trim(unit.primary_opponent_name) as guild_name,
      unit.outcome
    from public.guild_battle_stat_units unit
    where unit.guild_id = p_guild_id
      and unit.started_at >= p_cutoff
      and not unit.is_engagement
  )
  select
    trim(row.guild_name) as guild_name,
    count(*)::integer as battle_count,
    count(*) filter (where row.outcome = 'win')::integer as wins,
    count(*) filter (where row.outcome = 'loss')::integer as losses,
    count(*) filter (where row.outcome = 'tie')::integer as ties
  from rival_rows row
  where nullif(trim(row.guild_name), '') is not null
  group by trim(row.guild_name)
  order by count(*) desc, trim(row.guild_name) asc
  limit greatest(0, least(coalesce(p_limit, 3), 50));
$$;

revoke all on function public.guild_top_rivals(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.guild_top_rivals(uuid, timestamptz, integer)
  to service_role;


create or replace function public.member_battle_participations(p_guild_id uuid)
returns table(
  discord_id text,
  albion_player_id text,
  raw_started_at timestamptz,
  outcome text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    avatar.discord_id,
    participation.albion_player_id,
    participation.started_at as raw_started_at,
    participation.outcome
  from public.guild_battle_stat_participations participation
  left join public.guild_avatars avatar
    on avatar.guild_id = participation.guild_id
   and avatar.albion_player_id = participation.albion_player_id
   and avatar.withdrawn_at is null
  where participation.guild_id = p_guild_id
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations(uuid)
  from public, anon, authenticated;
grant execute on function public.member_battle_participations(uuid)
  to service_role;


create or replace function public.member_battle_participations_for_member(
  p_guild_id uuid,
  p_albion_player_id text default null,
  p_discord_id text default null
)
returns table(
  discord_id text,
  albion_player_id text,
  raw_started_at timestamptz,
  outcome text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    avatar.discord_id,
    participation.albion_player_id,
    participation.started_at as raw_started_at,
    participation.outcome
  from public.guild_battle_stat_participations participation
  left join public.guild_avatars avatar
    on avatar.guild_id = participation.guild_id
   and avatar.albion_player_id = participation.albion_player_id
   and avatar.withdrawn_at is null
  where participation.guild_id = p_guild_id
    and (
      (
        p_albion_player_id is not null
        and participation.albion_player_id = p_albion_player_id
      )
      or (
        p_albion_player_id is null
        and p_discord_id is not null
        and avatar.discord_id = p_discord_id
      )
    )
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations_for_member(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.member_battle_participations_for_member(uuid, text, text)
  to service_role;


create or replace function public.member_leaderboard_rollups(
  p_guild_id uuid,
  p_since timestamptz,
  p_bundle_splits boolean default false
)
returns table (
  albion_player_id text,
  kills integer,
  deaths integer,
  participations integer,
  death_battles integer,
  wins integer,
  losses integer
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
       and unit.started_at >= p_since
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
  participation_events as (
    select distinct
      participation.albion_player_id,
      tracked.stat_unit_id,
      tracked.started_at,
      tracked.outcome,
      0::integer as kill_count,
      0::integer as death_count
    from tracked
    inner join public.guild_battle_stat_participations participation
      on participation.guild_id = tracked.guild_id
     and participation.stat_unit_id = tracked.stat_unit_id
  ),
  official_kill_events as (
    select
      event.albion_player_id,
      event.stat_unit_id,
      min(event.started_at) as started_at,
      max(event.outcome) as outcome,
      count(*) filter (where event.role = 'killer')::integer as kill_count,
      count(*) filter (where event.role = 'victim')::integer as death_count
    from public.guild_battle_stat_events event
    inner join tracked
      on tracked.is_engagement
     and tracked.guild_id = event.guild_id
     and tracked.stat_unit_id = event.stat_unit_id
    where event.discord_id is not null
      and event.albion_player_id is not null
    group by event.albion_player_id, event.stat_unit_id
  ),
  legacy_event_matches as (
    select
      event.albion_player_id,
      event.role,
      tracked.stat_unit_id,
      tracked.started_at,
      tracked.outcome,
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
      and event.occurred_at >= p_since
  ),
  legacy_kill_events as (
    select
      match.albion_player_id,
      match.stat_unit_id,
      min(match.started_at) as started_at,
      max(match.outcome) as outcome,
      count(*) filter (where match.role = 'killer')::integer as kill_count,
      count(*) filter (where match.role = 'victim')::integer as death_count
    from legacy_event_matches match
    where match.match_rank = 1
    group by match.albion_player_id, match.stat_unit_id
  ),
  per_unit as (
    select
      row.albion_player_id,
      row.stat_unit_id,
      min(row.started_at) as started_at,
      max(row.outcome) as outcome,
      sum(row.kill_count)::integer as kill_count,
      sum(row.death_count)::integer as death_count
    from (
      select * from participation_events
      union all
      select * from official_kill_events
      union all
      select * from legacy_kill_events
    ) row
    where row.albion_player_id is not null
    group by row.albion_player_id, row.stat_unit_id
  )
  select
    unit.albion_player_id,
    coalesce(sum(unit.kill_count), 0)::integer as kills,
    coalesce(sum(unit.death_count), 0)::integer as deaths,
    count(*)::integer as participations,
    count(*) filter (where unit.death_count > 0)::integer as death_battles,
    count(*) filter (where unit.outcome = 'win')::integer as wins,
    count(*) filter (where unit.outcome = 'loss')::integer as losses
  from per_unit unit
  group by unit.albion_player_id
  order by unit.albion_player_id asc;
$$;

revoke all on function public.member_leaderboard_rollups(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.member_leaderboard_rollups(uuid, timestamptz, boolean)
  to service_role;


create or replace function public.member_ranking_counts(p_guild_id uuid)
returns table(
  discord_id text,
  albion_player_id text,
  kills integer,
  deaths integer,
  participations integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    avatar.discord_id,
    rollup.albion_player_id,
    rollup.kills,
    rollup.deaths,
    rollup.participations
  from public.member_leaderboard_rollups(
    p_guild_id,
    '1970-01-01 00:00:00+00'::timestamptz,
    true
  ) rollup
  left join public.guild_avatars avatar
    on avatar.guild_id = p_guild_id
   and avatar.albion_player_id = rollup.albion_player_id
   and avatar.withdrawn_at is null;
$$;

revoke all on function public.member_ranking_counts(uuid)
  from public, anon, authenticated;
grant execute on function public.member_ranking_counts(uuid)
  to service_role;


create or replace function public.guild_top_weapon_categories(
  p_guild_id uuid,
  p_cutoff timestamptz,
  p_bundle_splits boolean default false,
  p_limit integer default 5
)
returns table (
  category text,
  sample_item_id text,
  battle_count integer
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
      event.occurred_at,
      'engagement:' || event.stat_unit_id::text as battle_key,
      event.equipment->'MainHand'->>'Type' as mainhand_type
    from public.guild_battle_stat_events event
    inner join tracked
      on tracked.is_engagement
     and tracked.guild_id = event.guild_id
     and tracked.stat_unit_id = event.stat_unit_id
    where event.role = 'killer'
      and event.discord_id is not null
      and event.albion_player_id is not null
  ),
  legacy_weapon_matches as (
    select
      event.event_id,
      event.occurred_at,
      event.equipment->'MainHand'->>'Type' as mainhand_type,
      'legacy:' || tracked.stat_unit_id::text as battle_key,
      row_number() over (
        partition by event.event_id
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
      and event.role = 'killer'
      and event.discord_id is not null
      and event.albion_player_id is not null
      and event.occurred_at >= p_cutoff
  ),
  matched_weapons as (
    select * from official_weapons
    union all
    select
      match.occurred_at,
      match.battle_key,
      match.mainhand_type
    from legacy_weapon_matches match
    where match.match_rank = 1
  ),
  categorized as (
    select
      weapon.occurred_at,
      weapon.battle_key,
      weapon.mainhand_type,
      regexp_replace(
        regexp_replace(
          regexp_replace(weapon.mainhand_type, '@.*$', ''),
          '^T[0-9]+_(2H|MAIN)_',
          ''
        ),
        '_(AVALON|HELL|KEEPER|MORGANA|UNDEAD|CRYSTAL|DEMON)$',
        ''
      ) as category
    from matched_weapons weapon
    where weapon.mainhand_type ~ '^T[0-9]+_(2H|MAIN)_.+'
  )
  select
    categorized.category,
    (
      array_agg(
        categorized.mainhand_type
        order by categorized.occurred_at desc, categorized.mainhand_type desc
      )
    )[1] as sample_item_id,
    count(distinct categorized.battle_key)::integer as battle_count
  from categorized
  where nullif(categorized.category, '') is not null
  group by categorized.category
  order by count(distinct categorized.battle_key) desc, categorized.category asc
  limit greatest(0, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.guild_top_weapon_categories(uuid, timestamptz, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.guild_top_weapon_categories(uuid, timestamptz, boolean, integer)
  to service_role;
