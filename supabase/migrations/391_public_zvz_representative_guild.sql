-- Select the guild that contributed the most to an alliance ranking row.
-- Contribution is battle-time alliance evidence: proportional battle credit first,
-- then kills and engagement count as deterministic tie-breakers.
-- Rollback: a forward migration may drop this function; no stored data is mutated.

create or replace function public.get_public_zvz_v2_representative_guilds(
  p_season_id uuid,
  p_snapshot_date date,
  p_scope text,
  p_alliance_ids text[]
)
returns table (
  alliance_albion_id text,
  guild_albion_id text,
  guild_name text,
  engagement_count integer,
  equivalent_battles numeric,
  kills integer
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible_alliance_engagements as (
    select
      evidence.evidence_date,
      evidence.engagement_id,
      evidence.entity_albion_id as alliance_albion_id
    from public.public_zvz_v2_season_evidence evidence
    where evidence.season_id = p_season_id
      and evidence.evidence_date <= p_snapshot_date
      and evidence.entity_kind = 'alliance'
      and evidence.entity_albion_id = any(coalesce(p_alliance_ids, array[]::text[]))
      and (
        p_scope = 'overall'
        or (
          p_scope in ('small', 'mid', 'large', 'zerg')
          and least(
            evidence.side_team_size,
            evidence.opponent_side_team_size
          ) * 4 >= greatest(
            evidence.side_team_size,
            evidence.opponent_side_team_size
          ) * 3
          and case
            when greatest(
              evidence.side_team_size,
              evidence.opponent_side_team_size
            ) <= 20 then 'small'
            when greatest(
              evidence.side_team_size,
              evidence.opponent_side_team_size
            ) <= 40 then 'mid'
            when greatest(
              evidence.side_team_size,
              evidence.opponent_side_team_size
            ) <= 80 then 'large'
            else 'zerg'
          end = p_scope
        )
      )
  ),
  guild_contributions as (
    select
      alliance.alliance_albion_id,
      guild.entity_albion_id as guild_albion_id,
      (array_agg(
        guild.entity_name
        order by guild.battle_started_at desc, guild.engagement_id desc
      ))[1] as guild_name,
      count(distinct guild.engagement_id)::integer as engagement_count,
      sum(guild.battle_credit)::numeric as equivalent_battles,
      sum(guild.kills)::integer as kills
    from eligible_alliance_engagements alliance
    join public.public_zvz_v2_season_evidence guild
      on guild.season_id = p_season_id
     and guild.evidence_date = alliance.evidence_date
     and guild.engagement_id = alliance.engagement_id
     and guild.entity_kind = 'guild'
     and guild.alliance_albion_id = alliance.alliance_albion_id
    group by alliance.alliance_albion_id, guild.entity_albion_id
  ),
  ranked as (
    select
      contribution.*,
      row_number() over (
        partition by contribution.alliance_albion_id
        order by
          contribution.equivalent_battles desc,
          contribution.kills desc,
          contribution.engagement_count desc,
          contribution.guild_name asc,
          contribution.guild_albion_id asc
      ) as contribution_rank
    from guild_contributions contribution
  )
  select
    ranked.alliance_albion_id,
    ranked.guild_albion_id,
    ranked.guild_name,
    ranked.engagement_count,
    ranked.equivalent_battles,
    ranked.kills
  from ranked
  where ranked.contribution_rank = 1
  order by ranked.alliance_albion_id;
$$;

revoke all on function public.get_public_zvz_v2_representative_guilds(
  uuid,
  date,
  text,
  text[]
) from public, anon, authenticated;

grant execute on function public.get_public_zvz_v2_representative_guilds(
  uuid,
  date,
  text,
  text[]
) to service_role;

comment on function public.get_public_zvz_v2_representative_guilds(
  uuid,
  date,
  text,
  text[]
) is
  'Returns one lead guild per alliance from battle-time evidence in the exact overall or comparable-scale ranking scope.';
