-- Public ZvZ battle board read model.
--
-- This intentionally stores weekly guild rollups, not a full raw kill/death
-- event archive. battle_records remains the public Albion battle source and
-- battle_force_summaries remains the per-battle force cache.

create table if not exists public.guild_weekly_zvz_rollups (
  week_start date not null,
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
  score numeric(12, 2) not null,
  rank integer not null check (rank >= 1),
  sample_status text not null check (sample_status in ('ranked', 'insufficient_sample')),
  latest_battle_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (week_start, albion_server, guild_albion_id)
);

create index if not exists idx_guild_weekly_zvz_rollups_week_server_rank
  on public.guild_weekly_zvz_rollups (week_start desc, albion_server, rank);

create index if not exists idx_guild_weekly_zvz_rollups_tenant
  on public.guild_weekly_zvz_rollups (tenant_id, week_start desc)
  where tenant_id is not null;

alter table public.guild_weekly_zvz_rollups enable row level security;

revoke all on public.guild_weekly_zvz_rollups from anon, authenticated;
grant select, insert, update, delete on public.guild_weekly_zvz_rollups to service_role;

comment on table public.guild_weekly_zvz_rollups is
  'Public AGM ZvZ board weekly guild rollup. Derived from public battle_records and battle_force_summaries; no private tenant operation data.';

create or replace view public.public_guild_tenant_links
with (security_invoker = true)
as
select
  t.id as tenant_id,
  t.slug as tenant_slug,
  server_setting.value as albion_server,
  home.value as albion_guild_id,
  coalesce(profile.value = 'true', false) as profile_enabled
from public.tenants t
join public.app_settings home
  on home.guild_id = t.id
 and home.key = 'albion_home_guild_id'
join public.app_settings server_setting
  on server_setting.guild_id = t.id
 and server_setting.key = 'albion_server'
left join public.app_settings profile
  on profile.guild_id = t.id
 and profile.key = 'guild_profile_enabled'
where t.status = 'active'
  and nullif(btrim(home.value), '') is not null
  and server_setting.value in ('west', 'east', 'europe');

revoke all on public.public_guild_tenant_links from anon, authenticated;
grant select on public.public_guild_tenant_links to service_role;

comment on view public.public_guild_tenant_links is
  'Service-role lookup from Albion guild id/server to active AGM tenant slug for public battle links.';

create or replace function public.refresh_guild_weekly_zvz_rollups(
  p_week_start date default (date_trunc('week', now())::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := coalesce(p_week_start, date_trunc('week', now())::date);
  v_rows integer := 0;
begin
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
      bfs.force_key,
      bfs.force_name,
      bfs.team_size,
      bfs.kills,
      bfs.deaths,
      bfs.kill_fame
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
      and a.team_size >= 21
      and b.team_size >= 21
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
  ),
  guild_forces as (
    select
      zb.battle_record_id,
      zb.albion_server,
      zb.started_at,
      substring(bfs.force_key from 3) as guild_albion_id,
      bfs.force_name as guild_name,
      bfs.alliance_id,
      bfs.alliance_name,
      bfs.team_size,
      bfs.kills,
      bfs.deaths,
      bfs.kill_fame
    from zvz_battles zb
    join public.battle_force_summaries bfs
      on bfs.battle_record_id = zb.battle_record_id
     and bfs.force_level = 'guild'
     and bfs.force_key like 'g:%'
     and bfs.team_size >= 10
  ),
  aggregated as (
    select
      v_week_start as week_start,
      gf.albion_server,
      gf.guild_albion_id,
      max(gf.guild_name) as guild_name,
      nullif(max(coalesce(gf.alliance_id, '')), '') as alliance_albion_id,
      nullif(max(coalesce(gf.alliance_name, '')), '') as alliance_name,
      max(link.tenant_id::text)::uuid as tenant_id,
      max(link.tenant_slug) as tenant_slug,
      coalesce(bool_or(link.profile_enabled), false) as tenant_profile_enabled,
      count(distinct gf.battle_record_id)::integer as zvz_battles,
      sum(gf.kills)::integer as kills,
      sum(gf.deaths)::integer as deaths,
      sum(gf.kill_fame)::bigint as kill_fame,
      round(avg(gf.team_size)::numeric, 2) as avg_force_size,
      max(gf.team_size)::integer as max_force_size,
      max(gf.started_at) as latest_battle_at
    from guild_forces gf
    left join public.public_guild_tenant_links link
      on link.albion_server = gf.albion_server
     and link.albion_guild_id = gf.guild_albion_id
    group by gf.albion_server, gf.guild_albion_id
  ),
  scored as (
    select
      a.*,
      case
        when a.avg_force_size <= 20 then 'small'
        when a.avg_force_size <= 40 then 'mid'
        when a.avg_force_size <= 80 then 'large'
        else 'zerg'
      end as division,
      case
        when a.zvz_battles >= 2 then 'ranked'
        else 'insufficient_sample'
      end as sample_status,
      round((
        a.zvz_battles * 25
        + a.kills * 3
        + greatest(a.kills - a.deaths, 0) * 2
        + (a.kill_fame::numeric / 500000)
        + (a.avg_force_size * 1.5)
        - greatest(a.deaths - a.kills, 0) * 0.5
      )::numeric, 2) as score
    from aggregated a
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
    now()
  from ranked;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'week_start', v_week_start,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.refresh_guild_weekly_zvz_rollups(date) from public;
revoke all on function public.refresh_guild_weekly_zvz_rollups(date) from anon, authenticated;
grant execute on function public.refresh_guild_weekly_zvz_rollups(date) to service_role;
