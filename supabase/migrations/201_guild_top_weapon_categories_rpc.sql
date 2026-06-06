-- Move public guild profile weapon distribution aggregation into Postgres.
-- The function keeps the same battle-tracking rules as the TypeScript fallback:
-- tenant scope, high-engagement battles only, bundle-split option, Discord-linked
-- killer rows only, and exact battle_id matching before legacy time-window match.

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
      coalesce(tbr.home_kills, 0) as home_kills,
      coalesce(tbr.home_deaths, 0) as home_deaths,
      coalesce(tbr.home_team_size, 0) as home_team_size,
      coalesce(tbr.main_opponent_team_size, 0) as main_opponent_team_size,
      br.ended_at,
      br.albion_battle_id
    from public.tenant_battle_records tbr
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
