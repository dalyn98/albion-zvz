-- 207: Battle activity classification.
--
-- /battles is a ZvZ battle surface, not a raw kill counter. Keep Albion raw
-- records immutable, but classify each guild-facing projection into ZvZ,
-- ganking, smallscale, low-engagement, review, or manually excluded.

alter table public.battle_view_projections
  add column if not exists activity_kind text not null default 'review',
  add column if not exists activity_source text not null default 'automatic',
  add column if not exists activity_reason text not null default 'legacy_backfill';

alter table public.battle_view_projections
  drop constraint if exists battle_view_projections_activity_kind_check;

alter table public.battle_view_projections
  add constraint battle_view_projections_activity_kind_check
  check (activity_kind in ('zvz', 'smallscale', 'ganking', 'low_engagement', 'review', 'excluded'));

alter table public.battle_view_projections
  drop constraint if exists battle_view_projections_activity_source_check;

alter table public.battle_view_projections
  add constraint battle_view_projections_activity_source_check
  check (activity_source in ('automatic', 'event_intent', 'manual'));

with classified as (
  select
    bvp.id,
    case
      when bvp.subject_team_size < 10
        or bvp.opponent_team_size < 10
        or ((bvp.subject_kills + bvp.subject_deaths) < (bvp.subject_team_size * 0.1) and bvp.subject_deaths < 3)
        then 'low_engagement'
      when bvp.subject_team_size >= 21
        and bvp.opponent_team_size >= 21
        and not (
          extract(epoch from (br.ended_at - br.started_at)) < 120
          and bvp.subject_kills >= 3
          and bvp.subject_deaths <= 1
          and bvp.opponent_kills <= 1
        )
        then 'zvz'
      when bvp.subject_team_size >= 21
        and bvp.opponent_team_size < 21
        and bvp.subject_kills >= 3
        and bvp.subject_deaths <= 1
        and bvp.opponent_kills <= 1
        then 'ganking'
      when bvp.subject_team_size <= 20
        and bvp.subject_team_size >= 18
        and bvp.subject_kills >= 3
        and bvp.subject_deaths <= 1
        and bvp.opponent_kills <= 1
        then 'ganking'
      when bvp.subject_team_size >= 18
        and bvp.opponent_team_size >= 18
        and bvp.subject_kills > 0
        and bvp.subject_deaths > 0
        and bvp.opponent_kills > 0
        and bvp.opponent_deaths > 0
        then 'smallscale'
      when bvp.subject_team_size >= 21
        and bvp.opponent_team_size >= 21
        then 'review'
      else 'smallscale'
    end as activity_kind,
    case
      when bvp.subject_team_size < 10
        or bvp.opponent_team_size < 10
        or ((bvp.subject_kills + bvp.subject_deaths) < (bvp.subject_team_size * 0.1) and bvp.subject_deaths < 3)
        then 'low_engagement_or_force_floor'
      when bvp.subject_team_size >= 21 and bvp.opponent_team_size >= 21
        then 'disarray_scale_mutual_or_sustained'
      when bvp.subject_team_size >= 18 and bvp.subject_deaths <= 1 and bvp.opponent_kills <= 1
        then 'large_party_one_sided_catch'
      when bvp.subject_team_size >= 18 and bvp.opponent_team_size >= 18
        then 'large_party_mutual_below_zvz_threshold'
      else 'meaningful_smallscale'
    end as activity_reason
  from public.battle_view_projections bvp
  inner join public.battle_records br on br.id = bvp.battle_record_id
)
update public.battle_view_projections bvp
set
  activity_kind = c.activity_kind,
  activity_source = 'automatic',
  activity_reason = c.activity_reason,
  view_policy = case
    when c.activity_kind = 'zvz' then 'default_meaningful'
    else 'small_or_low_engagement'
  end
from classified c
where c.id = bvp.id;

create table if not exists public.battle_activity_overrides (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  relation_scope text not null default 'direct' check (relation_scope in ('direct', 'alliance')),
  activity_kind text not null check (activity_kind in ('zvz', 'smallscale', 'ganking', 'low_engagement', 'review', 'excluded')),
  reason text,
  created_by_discord_id text not null,
  updated_by_discord_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, battle_record_id, relation_scope)
);

alter table public.battle_activity_overrides enable row level security;

revoke all on public.battle_activity_overrides from anon, authenticated;

create index if not exists idx_battle_activity_overrides_guild_battle
  on public.battle_activity_overrides (guild_id, battle_record_id, relation_scope);

comment on table public.battle_activity_overrides is
  'Tenant-scoped manual activity classification for battle records. Raw Albion battle_records remain immutable.';

create or replace function public.battle_has_ganking_event(
  p_guild_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.guild_id = p_guild_id
      and e.category = '갱킹'
      and coalesce(e.battle_started_at, e.gather_at) is not null
      and p_started_at >= coalesce(e.battle_started_at, e.gather_at) - interval '30 minutes'
      and p_started_at <= coalesce(e.battle_started_at, e.gather_at) + interval '4 hours'
      and (
        p_ended_at is null
        or p_ended_at >= coalesce(e.battle_started_at, e.gather_at) - interval '30 minutes'
      )
  );
$$;

revoke all on function public.battle_has_ganking_event(uuid, timestamptz, timestamptz) from public;
revoke all on function public.battle_has_ganking_event(uuid, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.battle_has_ganking_event(uuid, timestamptz, timestamptz) to service_role;

create or replace function public.resolve_battle_activity_kind(
  p_guild_id uuid,
  p_battle_record_id uuid,
  p_relation_scope text default 'direct'
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override text;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_home_guild_id text;
  v_projection_kind text;
  v_fallback_kind text;
begin
  select bao.activity_kind
    into v_override
    from public.battle_activity_overrides bao
   where bao.guild_id = p_guild_id
     and bao.battle_record_id = p_battle_record_id
     and bao.relation_scope = coalesce(nullif(p_relation_scope, ''), 'direct')
   order by bao.updated_at desc
   limit 1;

  if v_override is not null then
    return v_override;
  end if;

  select br.started_at, br.ended_at
    into v_started_at, v_ended_at
    from public.battle_records br
   where br.id = p_battle_record_id;

  if v_started_at is null then
    return 'review';
  end if;

  if public.battle_has_ganking_event(p_guild_id, v_started_at, v_ended_at) then
    return 'ganking';
  end if;

  select nullif(btrim(s.value), '')
    into v_home_guild_id
    from public.app_settings s
   where s.guild_id = p_guild_id
     and s.key = 'albion_home_guild_id'
   limit 1;

  if v_home_guild_id is not null then
    select case
      when bool_or(bvp.activity_kind = 'zvz') then 'zvz'
      when bool_or(bvp.activity_kind = 'excluded') then 'excluded'
      when bool_or(bvp.activity_kind = 'ganking') then 'ganking'
      when bool_or(bvp.activity_kind = 'review') then 'review'
      when bool_or(bvp.activity_kind = 'smallscale') then 'smallscale'
      else 'low_engagement'
    end
      into v_projection_kind
      from public.battle_view_projections bvp
     where bvp.battle_record_id = p_battle_record_id
       and bvp.subject_type = 'guild'
       and bvp.subject_albion_id = v_home_guild_id
       and bvp.relation_scope = coalesce(nullif(p_relation_scope, ''), 'direct');

    if v_projection_kind is not null then
      return v_projection_kind;
    end if;
  end if;

  with grouped as (
    select
      sum(coalesce(tbr.home_kills, 0)) as home_kills,
      sum(coalesce(tbr.home_deaths, 0)) as home_deaths,
      max(coalesce(tbr.home_team_size, 0)) as home_team_size,
      max(coalesce(tbr.main_opponent_team_size, 0)) as main_opponent_team_size
    from public.tenant_battle_records tbr
    where tbr.guild_id = p_guild_id
      and tbr.battle_record_id = p_battle_record_id
  )
  select case
    when home_team_size is null then 'review'
    when (home_kills + home_deaths) < (home_team_size * 0.1) and home_deaths < 3 then 'low_engagement'
    when home_team_size >= 21 and main_opponent_team_size >= 21 then 'zvz'
    when home_team_size >= 18 and main_opponent_team_size >= 18 then 'smallscale'
    else 'low_engagement'
  end
    into v_fallback_kind
    from grouped;

  return coalesce(v_fallback_kind, 'review');
end;
$$;

revoke all on function public.resolve_battle_activity_kind(uuid, uuid, text) from public;
revoke all on function public.resolve_battle_activity_kind(uuid, uuid, text) from anon, authenticated;
grant execute on function public.resolve_battle_activity_kind(uuid, uuid, text) to service_role;

create or replace view public.guild_battle_views
with (security_invoker = true)
as
with tenant_home as (
  select
    t.id as tenant_id,
    home.value as home_guild_id,
    nullif(server.value, '') as albion_server
  from public.tenants t
  join public.app_settings home
    on home.guild_id = t.id
   and home.key = 'albion_home_guild_id'
   and btrim(home.value) <> ''
  left join public.app_settings server
    on server.guild_id = t.id
   and server.key = 'albion_server'
  where t.status = 'active'
)
select
  bvp.id,
  th.tenant_id,
  bvp.battle_record_id,
  tbr.id as legacy_tenant_battle_record_id,
  br.albion_server,
  br.albion_battle_id,
  br.started_at,
  br.ended_at,
  br.cluster_name,
  br.total_players,
  br.total_kills,
  br.total_fame,
  bvp.subject_type,
  bvp.subject_albion_id,
  bvp.subject_name,
  bvp.subject_alliance_id,
  bvp.subject_alliance_name,
  bvp.relation_scope,
  bvp.opponent_force_key,
  bvp.opponent_force_kind,
  bvp.opponent_force_albion_id,
  bvp.opponent_force_name,
  bvp.opponent_alliance_id,
  bvp.subject_team_size,
  bvp.subject_kills,
  bvp.subject_deaths,
  bvp.subject_kill_fame,
  bvp.opponent_team_size,
  bvp.opponent_kills,
  bvp.opponent_deaths,
  bvp.opponent_kill_fame,
  bvp.status,
  bvp.evidence_source,
  (activity.activity_kind = 'zvz') as is_meaningful,
  case
    when activity.activity_kind = 'zvz' then 'default_meaningful'
    else 'small_or_low_engagement'
  end as view_policy,
  bvp.result_estimate,
  bvp.size_category,
  bvp.legacy_outcome,
  tbr.outcome as legacy_row_outcome,
  tbr.is_provisional as legacy_is_provisional,
  tbr.match_index,
  tbr.match_total,
  exists (
    select 1
    from public.battle_projection_diffs diff
    where diff.battle_record_id = bvp.battle_record_id
      and diff.subject_type = bvp.subject_type
      and diff.subject_albion_id = bvp.subject_albion_id
      and diff.resolved_at is null
  ) as has_active_diff,
  coalesce(
    (
      select array_agg(distinct diff.diff_type order by diff.diff_type)
      from public.battle_projection_diffs diff
      where diff.battle_record_id = bvp.battle_record_id
        and diff.subject_type = bvp.subject_type
        and diff.subject_albion_id = bvp.subject_albion_id
        and diff.resolved_at is null
    ),
    '{}'::text[]
  ) as active_diff_types,
  bvp.evaluated_at,
  bvp.created_at,
  bvp.updated_at,
  activity.activity_kind,
  activity.activity_source,
  activity.activity_reason,
  bvp.activity_kind as automatic_activity_kind,
  bvp.activity_reason as automatic_activity_reason
from public.battle_view_projections bvp
join public.battle_records br
  on br.id = bvp.battle_record_id
join tenant_home th
  on th.home_guild_id = bvp.subject_albion_id
 and (th.albion_server is null or th.albion_server = br.albion_server)
left join public.tenant_battle_records tbr
  on tbr.guild_id = th.tenant_id
 and tbr.battle_record_id = bvp.battle_record_id
 and tbr.main_opponent_force_key = bvp.opponent_force_key
left join public.battle_activity_overrides bao
  on bao.guild_id = th.tenant_id
 and bao.battle_record_id = bvp.battle_record_id
 and bao.relation_scope = bvp.relation_scope
left join lateral (
  select public.battle_has_ganking_event(th.tenant_id, br.started_at, br.ended_at) as has_ganking_event
) event_intent on true
cross join lateral (
  select
    case
      when bao.activity_kind is not null then bao.activity_kind
      when event_intent.has_ganking_event then 'ganking'
      else bvp.activity_kind
    end as activity_kind,
    case
      when bao.activity_kind is not null then 'manual'
      when event_intent.has_ganking_event then 'event_intent'
      else bvp.activity_source
    end as activity_source,
    case
      when bao.activity_kind is not null then coalesce(nullif(bao.reason, ''), 'manual_override')
      when event_intent.has_ganking_event then 'ganking_event_window'
      else bvp.activity_reason
    end as activity_reason
) activity;

revoke all on public.guild_battle_views from anon, authenticated;

comment on view public.guild_battle_views is
  'Tenant-bound battle ledger read model for /battles. Applies activity classification and tenant-scoped manual overrides.';

create or replace view public.tenant_zvz_battle_records
with (security_invoker = true)
as
select tbr.*
from public.tenant_battle_records tbr
where public.resolve_battle_activity_kind(tbr.guild_id, tbr.battle_record_id, 'direct') = 'zvz';

revoke all on public.tenant_zvz_battle_records from anon, authenticated;

comment on view public.tenant_zvz_battle_records is
  'Compatibility view over tenant_battle_records containing only battles effectively classified as ZvZ.';

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
    from public.tenant_zvz_battle_records tbr
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
  from public.tenant_zvz_battle_records tbr
  where tbr.guild_id = p_guild_id
    and tbr.started_at >= p_cutoff
    and nullif(trim(tbr.primary_opponent_name), '') is not null
  group by trim(tbr.primary_opponent_name)
  order by count(*) desc, trim(tbr.primary_opponent_name) asc
  limit greatest(0, least(coalesce(p_limit, 3), 50));
$$;

revoke all on function public.guild_top_rivals(uuid, timestamptz, integer) from public;
revoke all on function public.guild_top_rivals(uuid, timestamptz, integer) from anon, authenticated;
grant execute on function public.guild_top_rivals(uuid, timestamptz, integer) to service_role;

create or replace function public.member_battle_participations(p_guild_id uuid)
returns table(
  discord_id        text,
  albion_player_id  text,
  raw_started_at    timestamptz,
  outcome           text
)
language sql
security definer
set search_path = public
as $$
  with tracked as (
    select
      tbr.guild_id,
      tbr.started_at,
      tbr.outcome,
      br.raw_battle
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
  )
  select distinct
    ga.discord_id,
    agm.albion_player_id,
    t.started_at as raw_started_at,
    t.outcome    as outcome
  from tracked t
  cross join lateral jsonb_each(t.raw_battle->'players') p
  inner join public.albion_guild_members agm
    on agm.guild_id = t.guild_id
   and agm.albion_player_id = p.value->>'id'
  left join public.guild_avatars ga
    on ga.guild_id = t.guild_id
   and ga.albion_player_id = agm.albion_player_id
   and ga.withdrawn_at is null
  where agm.left_at is null
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations(uuid) from public;
grant execute on function public.member_battle_participations(uuid) to authenticated, service_role;

create or replace function public.member_battle_participations_for_member(
  p_guild_id uuid,
  p_albion_player_id text default null,
  p_discord_id text default null
)
returns table(
  discord_id        text,
  albion_player_id  text,
  raw_started_at    timestamptz,
  outcome           text
)
language sql
stable
security definer
set search_path = public
as $$
  with target_members as (
    select
      agm.guild_id,
      agm.albion_player_id,
      ga.discord_id
    from public.albion_guild_members agm
    left join public.guild_avatars ga
      on ga.guild_id = agm.guild_id
     and ga.albion_player_id = agm.albion_player_id
     and ga.withdrawn_at is null
    where agm.guild_id = p_guild_id
      and agm.left_at is null
      and (
        (p_albion_player_id is not null and agm.albion_player_id = p_albion_player_id)
        or (
          p_albion_player_id is null
          and p_discord_id is not null
          and ga.discord_id = p_discord_id
        )
      )
  ),
  tracked as (
    select
      tbr.guild_id,
      tbr.started_at,
      tbr.outcome,
      br.raw_battle
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
  )
  select distinct
    tm.discord_id,
    tm.albion_player_id,
    t.started_at as raw_started_at,
    t.outcome    as outcome
  from tracked t
  cross join lateral jsonb_each(t.raw_battle->'players') p
  inner join target_members tm
    on tm.guild_id = t.guild_id
   and tm.albion_player_id = p.value->>'id'
  order by 3 asc, 2 asc, 1 asc, 4 asc;
$$;

revoke all on function public.member_battle_participations_for_member(uuid, text, text) from public;
revoke all on function public.member_battle_participations_for_member(uuid, text, text) from anon, authenticated;
grant execute on function public.member_battle_participations_for_member(uuid, text, text) to service_role;

create or replace function public.member_ranking_counts(p_guild_id uuid)
returns table(
  discord_id        text,
  albion_player_id  text,
  kills             integer,
  deaths            integer,
  participations    integer
)
language sql
security definer
set search_path = public
as $$
  with raw_windows as (
    select
      tbr.battle_record_id,
      min(tbr.started_at)                         as raw_start,
      min(tbr.started_at) - interval '15 minutes' as window_start,
      max(br.ended_at) + interval '15 minutes'    as window_end,
      br.albion_battle_id                         as albion_battle_id,
      br.raw_battle                               as raw_battle
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and br.ended_at is not null
    group by tbr.battle_record_id, br.albion_battle_id, br.raw_battle
  ),
  windows as (
    select
      *,
      coalesce(albion_battle_id::text, raw_start::text) as battle_key
    from raw_windows
  ),
  kill_death_counts as (
    select
      ke.albion_player_id,
      count(*) filter (where ke.role = 'killer')::integer as kills,
      count(*) filter (where ke.role = 'victim')::integer as deaths
    from public.killboard_events ke
    where ke.guild_id = p_guild_id
      and ke.discord_id is not null
      and (
        (
          ke.battle_id is not null
          and exists (
            select 1 from windows w
            where w.albion_battle_id = ke.battle_id
          )
        )
        or (
          ke.battle_id is null
          and exists (
            select 1 from windows w
            where ke.occurred_at between w.window_start and w.window_end
          )
        )
      )
    group by ke.albion_player_id
  ),
  participation_counts as (
    select
      agm.albion_player_id,
      count(distinct w.battle_key)::integer as participations
    from windows w
    cross join lateral jsonb_each(w.raw_battle->'players') p
    inner join public.albion_guild_members agm
      on agm.guild_id = p_guild_id
     and agm.albion_player_id = p.value->>'id'
    where agm.left_at is null
    group by agm.albion_player_id
  )
  select
    ga.discord_id,
    coalesce(k.albion_player_id, p.albion_player_id) as albion_player_id,
    coalesce(k.kills, 0)                              as kills,
    coalesce(k.deaths, 0)                             as deaths,
    coalesce(p.participations, 0)                     as participations
  from kill_death_counts k
  full outer join participation_counts p on p.albion_player_id = k.albion_player_id
  left join public.guild_avatars ga
    on ga.albion_player_id = coalesce(k.albion_player_id, p.albion_player_id)
   and ga.guild_id = p_guild_id
   and ga.withdrawn_at is null;
$$;

revoke all on function public.member_ranking_counts(uuid) from public;
grant execute on function public.member_ranking_counts(uuid) to authenticated, service_role;

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
    from public.tenant_zvz_battle_records tbr
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
  tracked as (
    select * from unbundled
    union all
    select * from bundled_canonical
  ),
  kill_tracked as (
    select distinct on (t.battle_record_id)
      t.*
    from tracked t
    order by
      t.battle_record_id,
      t.started_at desc
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
  ),
  participation_events as (
    select distinct
      rows.albion_player_id,
      rows.battle_record_id,
      rows.started_at,
      rows.outcome,
      0::integer as kill_count,
      0::integer as death_count
    from raw_participations rows
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
    select
      tbr.id,
      tbr.guild_id,
      tbr.battle_record_id,
      tbr.started_at,
      coalesce(tbr.main_opponent_team_size, 0) as main_opponent_team_size,
      br.ended_at,
      br.albion_battle_id
    from public.tenant_zvz_battle_records tbr
    inner join public.battle_records br on br.id = tbr.battle_record_id
    where tbr.guild_id = p_guild_id
      and tbr.started_at >= p_cutoff
      and br.ended_at is not null
  ),
  unbundled as (
    select
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.ended_at,
      s.albion_battle_id
    from scoped s
    where not p_bundle_splits
  ),
  bundled_canonical as (
    select distinct on (s.battle_record_id)
      s.guild_id,
      s.battle_record_id,
      s.started_at,
      s.ended_at,
      s.albion_battle_id
    from scoped s
    where p_bundle_splits
    order by
      s.battle_record_id,
      s.main_opponent_team_size desc,
      s.started_at desc,
      s.id desc
  ),
  tracked as (
    select * from unbundled
    union all
    select * from bundled_canonical
  ),
  tracked_keys as (
    select distinct
      t.battle_record_id,
      t.started_at,
      t.ended_at,
      t.albion_battle_id,
      case
        when t.albion_battle_id is not null then 'albion:' || t.albion_battle_id::text
        else 'time:' || t.started_at::text
      end as battle_key
    from tracked t
  ),
  weapon_event_matches as (
    select
      ke.event_id,
      ke.occurred_at,
      ke.equipment->'MainHand'->>'Type' as mainhand_type,
      tk.battle_key,
      row_number() over (
        partition by ke.event_id
        order by tk.started_at desc, tk.battle_record_id
      ) as match_rank
    from public.killboard_events ke
    inner join tracked_keys tk
      on (
        ke.battle_id is not null
        and tk.albion_battle_id is not null
        and ke.battle_id = tk.albion_battle_id
      )
      or (
        ke.battle_id is null
        and ke.occurred_at >= tk.started_at - interval '15 minutes'
        and ke.occurred_at <= tk.ended_at + interval '15 minutes'
      )
    where ke.guild_id = p_guild_id
      and ke.role = 'killer'
      and ke.discord_id is not null
      and ke.albion_player_id is not null
      and ke.occurred_at >= p_cutoff
  ),
  matched_weapons as (
    select
      wem.occurred_at,
      wem.battle_key,
      wem.mainhand_type
    from weapon_event_matches wem
    where wem.match_rank = 1
      and wem.mainhand_type ~ '^T[0-9]+_(2H|MAIN)_.+'
  ),
  categorized as (
    select
      mw.occurred_at,
      mw.battle_key,
      mw.mainhand_type,
      regexp_replace(
        regexp_replace(
          regexp_replace(mw.mainhand_type, '@.*$', ''),
          '^T[0-9]+_(2H|MAIN)_',
          ''
        ),
        '_(AVALON|HELL|KEEPER|MORGANA|UNDEAD|CRYSTAL|DEMON)$',
        ''
      ) as category
    from matched_weapons mw
  )
  select
    c.category,
    (array_agg(c.mainhand_type order by c.occurred_at desc, c.mainhand_type desc))[1] as sample_item_id,
    count(distinct c.battle_key)::integer as battle_count
  from categorized c
  where nullif(c.category, '') is not null
  group by c.category
  order by count(distinct c.battle_key) desc, c.category asc
  limit greatest(0, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.guild_top_weapon_categories(uuid, timestamptz, boolean, integer) from public;
revoke all on function public.guild_top_weapon_categories(uuid, timestamptz, boolean, integer) from anon, authenticated;
grant execute on function public.guild_top_weapon_categories(uuid, timestamptz, boolean, integer) to service_role;
