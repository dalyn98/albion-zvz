-- Restore the two Menhera ZvZ battles that lost their legacy tenant rows when
-- killboard ingestion arrived after the old provisional-row deletion pass.
-- The immutable battle source, participant snapshots, and direct ZvZ projections
-- already exist, so rebuild only the missing tenant compatibility rows.
with candidates as (
  select
    t.id as tenant_id,
    br.id as battle_record_id,
    br.started_at,
    bvp.subject_albion_id,
    bvp.subject_name,
    bvp.subject_alliance_id,
    bvp.subject_alliance_name,
    bvp.subject_team_size,
    bvp.subject_kills,
    bvp.subject_deaths,
    bvp.subject_kill_fame,
    bvp.opponent_force_key,
    bvp.opponent_force_kind,
    bvp.opponent_force_name,
    bvp.opponent_alliance_id,
    bvp.opponent_team_size,
    bvp.opponent_kills,
    bvp.opponent_deaths,
    bvp.opponent_kill_fame,
    bvp.size_category,
    bvp.legacy_outcome,
    bvp.evaluated_at,
    row_number() over (
      partition by t.id, br.id
      order by bvp.opponent_force_key
    )::integer as match_index,
    count(*) over (partition by t.id, br.id)::integer as match_total
  from public.tenants t
  join public.app_settings home
    on home.guild_id = t.id
   and home.key = 'albion_home_guild_id'
  join public.battle_records br
    on br.albion_server = 'east'
   and br.albion_battle_id in (490635697, 490643714)
  join public.battle_view_projections bvp
    on bvp.battle_record_id = br.id
   and bvp.subject_type = 'guild'
   and bvp.subject_albion_id = btrim(home.value)
   and bvp.relation_scope = 'direct'
   and bvp.activity_kind = 'zvz'
   and bvp.is_meaningful = true
  where t.slug = 'menhera'
)
insert into public.tenant_battle_records (
  guild_id,
  battle_record_id,
  home_guild_id,
  home_guild_name,
  home_alliance_id,
  home_alliance_name,
  home_team_size,
  home_kills,
  home_deaths,
  home_kill_fame,
  opponent_team_size,
  opponent_kills,
  opponent_deaths,
  opponent_kill_fame,
  opponent_guild_names,
  opponent_alliance_names,
  primary_opponent_name,
  size_category,
  outcome,
  outcome_method,
  started_at,
  main_opponent_force_key,
  main_opponent_force_kind,
  main_opponent_force_name,
  main_opponent_alliance_id,
  main_opponent_team_size,
  main_opponent_kills,
  main_opponent_deaths,
  main_opponent_kill_fame,
  match_index,
  match_total,
  is_provisional,
  match_evaluated_at
)
select
  tenant_id,
  battle_record_id,
  subject_albion_id,
  subject_name,
  subject_alliance_id,
  subject_alliance_name,
  subject_team_size,
  subject_kills,
  subject_deaths,
  subject_kill_fame,
  opponent_team_size,
  opponent_kills,
  opponent_deaths,
  opponent_kill_fame,
  case
    when opponent_force_kind = 'guild' then array[opponent_force_name]
    else '{}'::text[]
  end,
  case
    when opponent_force_kind = 'alliance' then array[opponent_force_name]
    else '{}'::text[]
  end,
  opponent_force_name,
  coalesce(
    size_category,
    case
      when greatest(subject_team_size, opponent_team_size) <= 30 then 'small'
      when greatest(subject_team_size, opponent_team_size) <= 60 then 'middle'
      when greatest(subject_team_size, opponent_team_size) <= 100 then 'large'
      else 'zerg'
    end
  ),
  coalesce(
    legacy_outcome,
    case
      when subject_kill_fame > opponent_kill_fame then 'win'
      when subject_kill_fame < opponent_kill_fame then 'loss'
      else 'tie'
    end
  ),
  'fame_diff',
  started_at,
  opponent_force_key,
  opponent_force_kind,
  opponent_force_name,
  opponent_alliance_id,
  opponent_team_size,
  opponent_kills,
  opponent_deaths,
  opponent_kill_fame,
  match_index,
  match_total,
  false,
  evaluated_at
from candidates
on conflict (guild_id, battle_record_id, main_opponent_force_key)
do nothing;
