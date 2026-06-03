-- Server/DB optimization RPCs.
--
-- These functions move high-volume aggregation out of Node request handlers
-- while keeping tenant scope explicit through p_guild_id.

create or replace function public.get_siphon_balances(
  p_guild_id uuid,
  p_operating_start timestamptz default null
)
returns table (
  player text,
  deposited bigint,
  withdrawn bigint,
  net bigint,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sl.player,
    coalesce(sum(sl.quantity) filter (where sl.quantity > 0), 0)::bigint as deposited,
    coalesce(sum(-sl.quantity) filter (where sl.quantity < 0), 0)::bigint as withdrawn,
    coalesce(sum(sl.quantity), 0)::bigint as net,
    max(sl.logged_at) as last_activity_at
  from public.siphon_ledger sl
  where sl.guild_id = p_guild_id
    and (p_operating_start is null or sl.logged_at >= p_operating_start)
  group by sl.player
  order by sl.player asc;
$$;

revoke all on function public.get_siphon_balances(uuid, timestamptz) from public;
revoke all on function public.get_siphon_balances(uuid, timestamptz) from anon, authenticated;
grant execute on function public.get_siphon_balances(uuid, timestamptz) to service_role;

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
    select
      tbr.id,
      tbr.battle_record_id,
      tbr.started_at,
      tbr.outcome,
      coalesce(tbr.home_kills, 0) as home_kills,
      coalesce(tbr.home_deaths, 0) as home_deaths,
      coalesce(tbr.home_team_size, 0) as home_team_size,
      coalesce(tbr.main_opponent_team_size, 0) as main_opponent_team_size
    from public.tenant_battle_records tbr
    where tbr.guild_id = p_guild_id
      and (p_since is null or tbr.started_at >= p_since)
  ),
  unbundled as (
    select
      s.battle_record_id,
      s.outcome,
      s.home_kills,
      s.home_deaths,
      s.home_team_size
    from scoped s
    where not p_bundle_splits
  ),
  bundled_totals as (
    select
      s.battle_record_id,
      sum(s.home_kills)::integer as home_kills,
      sum(s.home_deaths)::integer as home_deaths,
      max(s.home_team_size)::integer as home_team_size
    from scoped s
    where p_bundle_splits
    group by s.battle_record_id
  ),
  bundled_canonical as (
    select distinct on (s.battle_record_id)
      s.battle_record_id,
      s.outcome
    from scoped s
    where p_bundle_splits
    order by
      s.battle_record_id,
      s.main_opponent_team_size desc,
      s.started_at desc,
      s.id desc
  ),
  evaluated as (
    select * from unbundled
    union all
    select
      bt.battle_record_id,
      bc.outcome,
      bt.home_kills,
      bt.home_deaths,
      bt.home_team_size
    from bundled_totals bt
    inner join bundled_canonical bc using (battle_record_id)
  ),
  meaningful as (
    select *
    from evaluated e
    where (e.home_kills + e.home_deaths) >= (e.home_team_size * 0.1)
       or e.home_deaths >= 3
  )
  select
    count(*)::integer as battle_count,
    count(*) filter (where outcome = 'win')::integer as win_count,
    count(*) filter (where outcome = 'loss')::integer as loss_count,
    count(*) filter (where outcome = 'tie')::integer as tie_count,
    coalesce(sum(home_kills), 0)::bigint as total_kills,
    coalesce(sum(home_deaths), 0)::bigint as total_deaths
  from meaningful;
$$;

revoke all on function public.guild_battle_rollup(uuid, timestamptz, boolean) from public;
revoke all on function public.guild_battle_rollup(uuid, timestamptz, boolean) from anon, authenticated;
grant execute on function public.guild_battle_rollup(uuid, timestamptz, boolean) to service_role;

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
  select
    trim(tbr.primary_opponent_name) as guild_name,
    count(*)::integer as battle_count,
    count(*) filter (where tbr.outcome = 'win')::integer as wins,
    count(*) filter (where tbr.outcome = 'loss')::integer as losses,
    count(*) filter (where tbr.outcome = 'tie')::integer as ties
  from public.tenant_battle_records tbr
  where tbr.guild_id = p_guild_id
    and tbr.is_high_engagement = true
    and tbr.started_at >= p_cutoff
    and nullif(trim(tbr.primary_opponent_name), '') is not null
  group by trim(tbr.primary_opponent_name)
  order by count(*) desc, trim(tbr.primary_opponent_name) asc
  limit greatest(0, least(coalesce(p_limit, 3), 50));
$$;

revoke all on function public.guild_top_rivals(uuid, timestamptz, integer) from public;
revoke all on function public.guild_top_rivals(uuid, timestamptz, integer) from anon, authenticated;
grant execute on function public.guild_top_rivals(uuid, timestamptz, integer) to service_role;

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
    select
      tbr.id,
      tbr.guild_id,
      tbr.battle_record_id,
      tbr.started_at,
      tbr.outcome,
      coalesce(tbr.home_kills, 0) as home_kills,
      coalesce(tbr.home_deaths, 0) as home_deaths,
      coalesce(tbr.home_team_size, 0) as home_team_size,
      coalesce(tbr.main_opponent_team_size, 0) as main_opponent_team_size,
      br.ended_at,
      br.albion_battle_id,
      br.raw_battle
    from public.tenant_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and tbr.started_at >= p_since
      and br.ended_at is not null
  ),
  unbundled as (
    select
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.outcome,
      s.ended_at,
      s.albion_battle_id,
      s.raw_battle
    from scoped s
    where not p_bundle_splits
      and (
        (s.home_kills + s.home_deaths) >= (s.home_team_size * 0.1)
        or s.home_deaths >= 3
      )
  ),
  bundled_totals as (
    select
      s.battle_record_id,
      sum(s.home_kills)::integer as home_kills,
      sum(s.home_deaths)::integer as home_deaths,
      max(s.home_team_size)::integer as home_team_size
    from scoped s
    where p_bundle_splits
    group by s.battle_record_id
  ),
  bundled_canonical as (
    select distinct on (s.battle_record_id)
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.outcome,
      s.ended_at,
      s.albion_battle_id,
      s.raw_battle
    from scoped s
    where p_bundle_splits
    order by
      s.battle_record_id,
      s.main_opponent_team_size desc,
      s.started_at desc,
      s.id desc
  ),
  bundled as (
    select bc.*
    from bundled_canonical bc
    inner join bundled_totals bt using (battle_record_id)
    where (bt.home_kills + bt.home_deaths) >= (bt.home_team_size * 0.1)
       or bt.home_deaths >= 3
  ),
  tracked as (
    select * from unbundled
    union all
    select * from bundled
  ),
  kill_tracked as (
    select distinct on (t.battle_record_id)
      t.*
    from tracked t
    order by
      t.battle_record_id,
      t.started_at desc
  ),
  projected_participations as (
    select
      agm.albion_player_id,
      t.battle_record_id,
      t.started_at,
      t.outcome
    from tracked t
    inner join public.battle_participant_snapshots bps
      on bps.battle_record_id = t.battle_record_id
     and bps.participant_type = 'player'
    inner join public.albion_guild_members agm
      on agm.guild_id = t.guild_id
     and agm.albion_player_id = bps.entity_albion_id
    where agm.left_at is null
  ),
  raw_participations as (
    select
      agm.albion_player_id,
      t.battle_record_id,
      t.started_at,
      t.outcome
    from tracked t
    cross join lateral jsonb_each(t.raw_battle->'players') p
    inner join public.albion_guild_members agm
      on agm.guild_id = t.guild_id
     and agm.albion_player_id = p.value->>'id'
    where agm.left_at is null
      and not exists (
        select 1
          from public.battle_participant_snapshots bps
         where bps.battle_record_id = t.battle_record_id
           and bps.participant_type = 'player'
      )
  ),
  participation_events as (
    select distinct
      rows.albion_player_id,
      rows.battle_record_id,
      rows.started_at,
      rows.outcome,
      0::integer as kill_count,
      0::integer as death_count
    from (
      select * from projected_participations
      union all
      select * from raw_participations
    ) rows
  ),
  kill_event_matches as (
    select
      ke.albion_player_id,
      ke.role,
      kt.battle_record_id,
      kt.started_at,
      kt.outcome,
      row_number() over (
        partition by ke.event_id, ke.role, ke.albion_player_id
        order by kt.started_at desc, kt.battle_record_id
      ) as match_rank
    from public.killboard_events ke
    inner join kill_tracked kt
      on (
        ke.battle_id is not null
        and kt.albion_battle_id is not null
        and ke.battle_id = kt.albion_battle_id
      )
      or (
        ke.battle_id is null
        and ke.occurred_at >= kt.started_at - interval '15 minutes'
        and ke.occurred_at <= kt.ended_at + interval '15 minutes'
      )
    where ke.guild_id = p_guild_id
      and ke.discord_id is not null
      and ke.albion_player_id is not null
      and ke.occurred_at >= p_since
  ),
  kill_events as (
    select
      kem.albion_player_id,
      kem.battle_record_id,
      kem.started_at,
      kem.outcome,
      count(*) filter (where kem.role = 'killer')::integer as kill_count,
      count(*) filter (where kem.role = 'victim')::integer as death_count
    from kill_event_matches kem
    where kem.match_rank = 1
    group by
      kem.albion_player_id,
      kem.battle_record_id,
      kem.started_at,
      kem.outcome
  ),
  per_battle as (
    select
      rows.albion_player_id,
      rows.battle_record_id,
      min(rows.started_at) as started_at,
      max(rows.outcome) as outcome,
      sum(rows.kill_count)::integer as kill_count,
      sum(rows.death_count)::integer as death_count
    from (
      select * from participation_events
      union all
      select * from kill_events
    ) rows
    where rows.albion_player_id is not null
    group by rows.albion_player_id, rows.battle_record_id
  )
  select
    pb.albion_player_id,
    coalesce(sum(pb.kill_count), 0)::integer as kills,
    coalesce(sum(pb.death_count), 0)::integer as deaths,
    count(*)::integer as participations,
    count(*) filter (where pb.death_count > 0)::integer as death_battles,
    count(*) filter (where pb.outcome = 'win')::integer as wins,
    count(*) filter (where pb.outcome = 'loss')::integer as losses
  from per_battle pb
  group by pb.albion_player_id
  order by pb.albion_player_id asc;
$$;

revoke all on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) from public;
revoke all on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) from anon, authenticated;
grant execute on function public.member_leaderboard_rollups(uuid, timestamptz, boolean) to service_role;
