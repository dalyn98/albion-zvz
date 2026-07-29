-- 293: Define an official fight by side size, not by each opponent force.
--
-- The application keeps alliance/guild matchups separate so a 12 + 8 opponent
-- engagement remains visible as 1:N. The official result is eligible only when
-- the home side has at least 20 players and the sum of result-eligible
-- (non-intervention) opponent forces has at least 20 players.
--
-- Migration 285 already owns the atomic publisher and all source/tenant
-- validations. Build a v2 publisher from that immutable predecessor so the
-- migration can land before the application switches RPCs without breaking
-- the currently deployed v1 caller.

alter table public.battle_engagements
  add column if not exists opponent_side_team_size integer not null default 0
  check (opponent_side_team_size >= 0);

do $migration$
declare
  v_function regprocedure := to_regprocedure(
    'public.publish_battle_engagement_projection(uuid,uuid,text,text,jsonb)'
  );
  v_original_body text;
  v_patched_body text;
  v_old_size_fragment constant text :=
    E'         or v_home_side_team_size < 10\n         or force.team_size < 10';
  v_new_size_fragment constant text :=
    E'         or v_home_side_team_size < 20\n'
    || E'         or (\n'
    || E'           select coalesce(sum(matchup.opponent_team_size), 0)\n'
    || E'             from public.battle_engagement_matchups matchup\n'
    || E'            where matchup.guild_id = link.guild_id\n'
    || E'              and matchup.run_id = link.run_id\n'
    || E'              and matchup.engagement_id = link.engagement_id\n'
    || E'              and matchup.matchup_role = ''result_eligible''\n'
    || E'         ) < 20';
  v_old_columns_fragment constant text :=
    E'      home_team_size,\n'
    || E'      home_side_team_size,\n'
    || E'      is_other_only,';
  v_new_columns_fragment constant text :=
    E'      home_team_size,\n'
    || E'      home_side_team_size,\n'
    || E'      opponent_side_team_size,\n'
    || E'      is_other_only,';
  v_old_values_fragment constant text :=
    E'      (v_engagement->>''homeTeamSize'')::integer,\n'
    || E'      (v_engagement->>''homeSideTeamSize'')::integer,\n'
    || E'      coalesce((v_engagement->>''isOtherOnly'')::boolean, false),';
  v_new_values_fragment constant text :=
    E'      (v_engagement->>''homeTeamSize'')::integer,\n'
    || E'      (v_engagement->>''homeSideTeamSize'')::integer,\n'
    || E'      (v_engagement->>''opponentSideTeamSize'')::integer,\n'
    || E'      coalesce((v_engagement->>''isOtherOnly'')::boolean, false),';
begin
  if v_function is null then
    raise exception 'BATTLE_ENGAGEMENT_PUBLISHER_MISSING';
  end if;

  select proc.prosrc
    into v_original_body
    from pg_proc proc
   where proc.oid = v_function::oid;

  if (
    strpos(v_original_body, v_old_size_fragment) = 0
    or strpos(v_original_body, v_old_columns_fragment) = 0
    or strpos(v_original_body, v_old_values_fragment) = 0
  ) then
    raise exception 'BATTLE_ENGAGEMENT_PUBLISHER_V2_PATCH_TARGET_MISSING';
  end if;

  v_patched_body := replace(
    v_original_body,
    v_old_size_fragment,
    v_new_size_fragment
  );
  v_patched_body := replace(
    v_patched_body,
    v_old_columns_fragment,
    v_new_columns_fragment
  );
  v_patched_body := replace(
    v_patched_body,
    v_old_values_fragment,
    v_new_values_fragment
  );
  if (
    v_patched_body = v_original_body
    or strpos(v_patched_body, v_old_size_fragment) > 0
    or strpos(v_patched_body, v_old_columns_fragment) > 0
    or strpos(v_patched_body, v_old_values_fragment) > 0
  ) then
    raise exception 'BATTLE_ENGAGEMENT_PUBLISHER_V2_PATCH_FAILED';
  end if;

  execute format(
    $definition$
      create or replace function public.publish_battle_engagement_projection_v2(
        p_guild_id uuid,
        p_battle_record_id uuid,
        p_home_guild_id text,
        p_source_hash text,
        p_projection jsonb
      )
      returns uuid
      language plpgsql
      security definer
      set search_path = public
      as %L
    $definition$,
    v_patched_body
  );
end;
$migration$;

revoke all on function public.publish_battle_engagement_projection_v2(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_battle_engagement_projection_v2(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.publish_battle_engagement_projection_v2(uuid, uuid, text, text, jsonb) is
  '원본·tenant·직접 event를 검증하고 홈 측 20명 및 개입 제외 상대측 합계 20명 조건으로 engagement projection을 원자 발행한다.';


create or replace view public.guild_battle_engagements
with (security_invoker = true)
as
select
  run.guild_id as tenant_id,
  run.id as run_id,
  run.battle_record_id,
  br.albion_server,
  br.albion_battle_id,
  br.cluster_name,
  br.started_at as raw_started_at,
  br.ended_at as raw_ended_at,
  br.total_players,
  br.total_kills,
  br.total_fame,
  run.home_guild_id,
  coalesce(
    br.raw_battle->'guilds'->run.home_guild_id->>'name',
    run.home_guild_id
  ) as home_guild_name,
  nullif(
    br.raw_battle->'guilds'->run.home_guild_id->>'allianceId',
    ''
  ) as home_alliance_id,
  nullif(
    br.raw_battle->'guilds'->run.home_guild_id->>'alliance',
    ''
  ) as home_alliance_name,
  run.source_hash,
  run.source_observation_count,
  run.state as run_state,
  run.reason as run_reason,
  run.raw_home_kills,
  run.raw_home_deaths,
  run.collected_home_kills,
  run.collected_home_deaths,
  run.unidentified_event_count,
  run.evaluated_at,
  engagement.id as engagement_id,
  engagement.engagement_key,
  engagement.sequence,
  engagement.started_at,
  engagement.ended_at,
  engagement.status,
  engagement.result,
  engagement.home_kills,
  engagement.home_deaths,
  engagement.home_kill_fame,
  engagement.opponent_kills,
  engagement.opponent_deaths,
  engagement.opponent_kill_fame,
  engagement.result_home_kills,
  engagement.result_home_deaths,
  engagement.result_home_kill_fame,
  engagement.result_opponent_kills,
  engagement.result_opponent_deaths,
  engagement.result_opponent_kill_fame,
  engagement.result_eligible_event_count,
  engagement.intervention_event_count,
  engagement.other_event_count,
  engagement.home_team_size,
  engagement.home_side_team_size,
  engagement.is_other_only,
  note.note,
  note.updated_at as note_updated_at,
  engagement.opponent_side_team_size
from public.battle_engagement_runs run
inner join public.battle_records br
  on br.id = run.battle_record_id
 and br.engagement_source_hash = run.source_hash
inner join public.battle_engagement_source_observations observation
  on observation.battle_record_id = run.battle_record_id
 and observation.source_hash = run.source_hash
left join public.battle_engagements engagement
  on engagement.guild_id = run.guild_id
 and engagement.run_id = run.id
left join public.battle_engagement_notes note
  on note.guild_id = run.guild_id
 and note.battle_record_id = run.battle_record_id
 and note.engagement_key = engagement.engagement_key;

revoke all on public.guild_battle_engagements from public, anon, authenticated;
grant select on public.guild_battle_engagements to service_role;

comment on view public.guild_battle_engagements is
  '현재 source hash와 일치하는 tenant 교전 projection 및 양측 공식 규모 근거만 노출한다.';
