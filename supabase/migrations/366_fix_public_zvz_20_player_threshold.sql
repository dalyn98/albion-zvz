-- 366: Align public AGM Battles rankings with the official 20-player floor.
--
-- The tenant battle projection has treated exactly 20 players as an official
-- fight since the engagement model was introduced. The tenant-neutral public
-- ranking refresh still used the legacy 21-player floor, which excluded valid
-- fights. This replacement also gives the weekly rebuild enough time to finish
-- on busy completed weeks instead of silently leaving weekend evidence stale.

create or replace function public.refresh_guild_weekly_zvz_rollups(
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
  v_evidence_rows integer := 0;
  v_rollup_rows integer := 0;
begin
  -- Two cron invocations may overlap. Serialize only the same week while
  -- allowing different historical weeks to refresh independently.
  perform pg_advisory_xact_lock(
    hashtextextended('refresh_guild_weekly_zvz_rollups:' || v_week_start::text, 0)
  );

  delete from public.guild_weekly_zvz_battle_evidence
   where week_start = v_week_start;

  delete from public.guild_weekly_zvz_rollups
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
  insert into public.guild_weekly_zvz_battle_evidence (
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
    updated_at
  )
  select
    v_week_start,
    zb.albion_server,
    substring(bfs.force_key from 3),
    zb.battle_record_id,
    zb.started_at,
    bfs.force_name,
    bfs.alliance_id,
    bfs.alliance_name,
    bfs.team_size,
    bfs.kills,
    bfs.deaths,
    bfs.kill_fame,
    'agm_zvz_v2_20plus',
    now()
  from zvz_battles zb
  join public.battle_force_summaries bfs
    on bfs.battle_record_id = zb.battle_record_id
   and bfs.force_level = 'guild'
   and bfs.force_key like 'g:%'
   and bfs.team_size >= 10;

  get diagnostics v_evidence_rows = row_count;

  with aggregated as (
    select
      e.week_start,
      e.albion_server,
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
    from public.guild_weekly_zvz_battle_evidence e
    where e.week_start = v_week_start
    group by e.week_start, e.albion_server, e.guild_albion_id
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
      where candidate.albion_server = a.albion_server
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
        partition by s.albion_server
        order by
          case when s.sample_status = 'ranked' then 0 else 1 end,
          s.score desc,
          s.kill_fame desc,
          s.guild_name asc
      )::integer as rank
    from scored s
  )
  insert into public.guild_weekly_zvz_rollups (
    week_start,
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
    week_start,
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
    'agm_zvz_v1',
    battle_points,
    kill_points,
    kd_bonus_points,
    kill_fame_points,
    force_size_points,
    death_penalty_points,
    now()
  from ranked;

  get diagnostics v_rollup_rows = row_count;

  return jsonb_build_object(
    'week_start', v_week_start,
    'qualification_version', 'agm_zvz_v2_20plus',
    'evidence_rows', v_evidence_rows,
    'rows', v_rollup_rows
  );
end;
$$;

revoke all on function public.refresh_guild_weekly_zvz_rollups(date)
  from public, anon, authenticated;
grant execute on function public.refresh_guild_weekly_zvz_rollups(date)
  to service_role;

comment on function public.refresh_guild_weekly_zvz_rollups(date) is
  'Rebuilds tenant-neutral AGM Battles evidence and rankings for one UTC week. Official fights require both leading sides to have at least 20 players.';
