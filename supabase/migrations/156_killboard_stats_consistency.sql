-- Killboard / battle-derived stats consistency pass.
--
-- 1) killboard_events natural key must be tenant-scoped. The original
--    `(event_id, role)` primary key was created before multi-tenancy and can
--    make another tenant silently ignore the same Albion event during sync.
-- 2) member_ranking_counts must follow the same battle matching rules as the
--    TypeScript tracked-kills helpers:
--      - if killboard_events.battle_id is present, exact battle_id match only
--      - legacy NULL battle_id rows fall back to the padded time window
--      - split matchup rows are bundled by battle_record_id before engagement
--        filtering so one Albion battle is counted once.

alter table public.killboard_events
  drop constraint if exists killboard_events_pkey;

alter table public.killboard_events
  add constraint killboard_events_pkey primary key (guild_id, event_id, role);

comment on constraint killboard_events_pkey on public.killboard_events is
  'Tenant-scoped Albion event natural key. Same event_id/role may exist in multiple guild tenants.';

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
      br.raw_battle                               as raw_battle,
      sum(coalesce(tbr.home_kills, 0))            as home_kills,
      sum(coalesce(tbr.home_deaths, 0))           as home_deaths,
      max(coalesce(tbr.home_team_size, 0))        as home_team_size
    from public.tenant_battle_records tbr
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
    where (home_kills + home_deaths) >= (home_team_size * 0.1)
       or home_deaths >= 3
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
