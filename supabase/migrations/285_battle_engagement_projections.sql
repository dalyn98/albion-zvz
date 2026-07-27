-- 285: Event-flow battle engagement projections.
--
-- battle_records is still the immutable-ish shared Albion source snapshot.
-- A tenant-facing "engagement" is a deterministic projection of that source
-- plus tenant-scoped direct killboard evidence. Manual split/merge is not
-- supported. Operators may only attach a contextual note; notes never change
-- boundaries, evidence, results, or statistics.

alter table public.killboard_events
  add column if not exists source_guild_id text,
  add column if not exists source_alliance_id text,
  add column if not exists opponent_guild_id text,
  add column if not exists opponent_alliance_id text,
  add column if not exists fame_is_observed boolean not null default false;

alter table public.battle_records
  add column if not exists engagement_source_hash text
  check (
    engagement_source_hash is null
    or engagement_source_hash ~ '^[a-f0-9]{64}$'
  );

create index if not exists idx_killboard_events_battle_source_identity
  on public.killboard_events (guild_id, battle_id, source_guild_id, occurred_at)
  where battle_id is not null;

comment on column public.killboard_events.source_guild_id is
  'Albion event 당시 추적 선수의 GuildId. 현재 로스터가 아니라 발생 시점 소속 판정에 사용.';
comment on column public.killboard_events.opponent_guild_id is
  'Albion event 상대의 GuildId. 길드명 변경/동명이름과 무관한 교전 force 식별 키.';
comment on column public.killboard_events.fame_is_observed is
  'TotalVictimKillFame이 Albion 응답에 실제 존재하고 유효했는지 여부. 누락값을 0 킬페임으로 오판하지 않게 한다.';
comment on column public.battle_records.engagement_source_hash is
  '현재 raw_battle의 애플리케이션 canonical SHA-256. 원본 변경 즉시 이전 교전 projection을 숨기는 기준.';


create table if not exists public.battle_engagement_source_observations (
  battle_record_id uuid primary key references public.battle_records(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  consecutive_observations integer not null default 1
    check (consecutive_observations >= 1),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  source_changed_at timestamptz not null,
  last_observation_token uuid not null,
  updated_at timestamptz not null default now()
);

comment on table public.battle_engagement_source_observations is
  '같은 battle_records 원본 해시가 연속 몇 회 관찰됐는지 기록. 2회 미만이면 공식 교전 판정을 발행하지 않는다.';


create table if not exists public.battle_engagement_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  home_guild_id text not null check (char_length(home_guild_id) between 1 and 128),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_observation_count integer not null check (source_observation_count >= 1),
  state text not null check (
    state in ('collecting', 'ready', 'segmentation_required', 'blocked')
  ),
  reason text not null check (
    reason in (
      'source_not_stable',
      'event_count_incomplete',
      'unidentified_event',
      'ambiguous_boundary',
      'complete'
    )
  ),
  raw_home_kills integer not null check (raw_home_kills >= 0),
  raw_home_deaths integer not null check (raw_home_deaths >= 0),
  collected_home_kills integer not null check (collected_home_kills >= 0),
  collected_home_deaths integer not null check (collected_home_deaths >= 0),
  unidentified_event_count integer not null default 0
    check (unidentified_event_count >= 0),
  ignored_non_home_event_count integer not null default 0
    check (ignored_non_home_event_count >= 0),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, battle_record_id),
  unique (guild_id, id),
  check (
    (state = 'collecting' and reason in ('source_not_stable', 'event_count_incomplete'))
    or (state = 'ready' and reason = 'complete')
    or (state = 'segmentation_required' and reason = 'ambiguous_boundary')
    or (state = 'blocked' and reason = 'unidentified_event')
  ),
  check (
    (reason = 'source_not_stable' and source_observation_count < 2)
    or (reason <> 'source_not_stable' and source_observation_count >= 2)
  ),
  check (
    state not in ('ready', 'segmentation_required')
    or (
      collected_home_kills = raw_home_kills
      and collected_home_deaths = raw_home_deaths
      and unidentified_event_count = 0
    )
  ),
  check (state <> 'blocked' or unidentified_event_count > 0)
);

create index if not exists idx_battle_engagement_runs_pending
  on public.battle_engagement_runs (guild_id, evaluated_at asc)
  where state in ('collecting', 'segmentation_required', 'blocked');

create index if not exists idx_battle_engagement_runs_battle
  on public.battle_engagement_runs (battle_record_id, guild_id);

comment on table public.battle_engagement_runs is
  'Tenant 관점의 최신 자동 교전 projection 발행 단위. source_hash 불일치 시 구 결과는 read view 에서 즉시 숨겨진다.';


create table if not exists public.battle_engagements (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  run_id uuid not null,
  engagement_key text not null check (engagement_key ~ '^[a-f0-9]{64}$'),
  sequence integer not null check (sequence >= 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  status text not null check (
    status in (
      'pending',
      'final',
      'insufficient_evidence',
      'segmentation_required',
      'blocked'
    )
  ),
  result text check (result in ('advantage', 'disadvantage', 'even')),
  home_kills integer not null check (home_kills >= 0),
  home_deaths integer not null check (home_deaths >= 0),
  home_kill_fame bigint not null check (home_kill_fame >= 0),
  opponent_kills integer not null check (opponent_kills >= 0),
  opponent_deaths integer not null check (opponent_deaths >= 0),
  opponent_kill_fame bigint not null check (opponent_kill_fame >= 0),
  result_home_kills integer not null check (result_home_kills >= 0),
  result_home_deaths integer not null check (result_home_deaths >= 0),
  result_home_kill_fame bigint not null check (result_home_kill_fame >= 0),
  result_opponent_kills integer not null check (result_opponent_kills >= 0),
  result_opponent_deaths integer not null check (result_opponent_deaths >= 0),
  result_opponent_kill_fame bigint not null check (result_opponent_kill_fame >= 0),
  result_eligible_event_count integer not null
    check (result_eligible_event_count >= 0),
  intervention_event_count integer not null
    check (intervention_event_count >= 0),
  other_event_count integer not null check (other_event_count >= 0),
  home_team_size integer not null check (home_team_size >= 0),
  home_side_team_size integer not null check (home_side_team_size >= 0),
  is_other_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, run_id)
    references public.battle_engagement_runs(guild_id, id)
    on delete cascade,
  unique (guild_id, run_id, sequence),
  unique (guild_id, run_id, engagement_key),
  unique (guild_id, run_id, id),
  check (ended_at >= started_at),
  check (
    (status = 'final' and result is not null)
    or (status <> 'final' and result is null)
  )
);

create index if not exists idx_battle_engagements_run_sequence
  on public.battle_engagements (guild_id, run_id, sequence);

comment on table public.battle_engagements is
  '원본 battle 안의 실제 이벤트 흐름 단위. 동일 상대도 명확한 공백 뒤에는 별도 engagement 가 될 수 있다.';


create table if not exists public.battle_engagement_matchups (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  run_id uuid not null,
  engagement_id uuid not null,
  force_key text not null check (char_length(force_key) between 3 and 260),
  force_kind text not null check (force_kind in ('alliance', 'guild')),
  force_albion_id text not null check (char_length(force_albion_id) between 1 and 128),
  force_name text not null check (char_length(force_name) between 1 and 256),
  opponent_alliance_id text,
  opponent_team_size integer not null check (opponent_team_size >= 0),
  matchup_role text not null check (
    matchup_role in ('result_eligible', 'intervention')
  ),
  event_count integer not null check (event_count >= 1),
  home_kills integer not null check (home_kills >= 0),
  home_deaths integer not null check (home_deaths >= 0),
  home_kill_fame bigint not null check (home_kill_fame >= 0),
  opponent_kills integer not null check (opponent_kills >= 0),
  opponent_deaths integer not null check (opponent_deaths >= 0),
  opponent_kill_fame bigint not null check (opponent_kill_fame >= 0),
  created_at timestamptz not null default now(),
  foreign key (guild_id, run_id, engagement_id)
    references public.battle_engagements(guild_id, run_id, id)
    on delete cascade,
  unique (guild_id, engagement_id, force_key)
);

create index if not exists idx_battle_engagement_matchups_force
  on public.battle_engagement_matchups (guild_id, force_key, engagement_id);

comment on table public.battle_engagement_matchups is
  '한 engagement 안에서 상대 force 별 근거를 분해한 행. 개별 matchup 에 별도 승패는 부여하지 않는다.';


create table if not exists public.battle_engagement_event_links (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  run_id uuid not null,
  engagement_id uuid,
  event_id bigint not null,
  role text not null check (role in ('killer', 'victim')),
  occurred_at timestamptz not null,
  fame bigint not null check (fame >= 0),
  classification text not null check (
    classification in (
      'result_eligible',
      'intervention',
      'other',
      'unidentified',
      'not_home_source'
    )
  ),
  other_reason text check (
    other_reason is null
    or other_reason in (
      'guildless',
      'force_below_minimum',
      'same_home_side',
      'not_home_source'
    )
  ),
  force_key text,
  force_kind text check (force_kind is null or force_kind in ('alliance', 'guild')),
  force_albion_id text,
  force_name text,
  opponent_guild_id text,
  opponent_guild_name text,
  opponent_alliance_id text,
  opponent_alliance_name text,
  created_at timestamptz not null default now(),
  foreign key (guild_id, run_id)
    references public.battle_engagement_runs(guild_id, id)
    on delete cascade,
  foreign key (guild_id, run_id, engagement_id)
    references public.battle_engagements(guild_id, run_id, id)
    on delete cascade,
  unique (guild_id, run_id, event_id, role)
);

create index if not exists idx_battle_engagement_event_links_engagement
  on public.battle_engagement_event_links (guild_id, engagement_id, occurred_at)
  where engagement_id is not null;

comment on table public.battle_engagement_event_links is
  '판정에 사용한 tenant killboard event의 분류 snapshot. 원본 로그 자체를 수정하지 않는다.';


create table if not exists public.battle_engagement_notes (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  engagement_key text not null check (engagement_key ~ '^[a-f0-9]{64}$'),
  note text not null check (char_length(note) between 1 and 1000),
  created_by_discord_id text not null check (
    char_length(created_by_discord_id) between 1 and 128
  ),
  updated_by_discord_id text not null check (
    char_length(updated_by_discord_id) between 1 and 128
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, battle_record_id, engagement_key)
);

create index if not exists idx_battle_engagement_notes_battle
  on public.battle_engagement_notes (guild_id, battle_record_id);

comment on table public.battle_engagement_notes is
  'Tenant 운영자 설명 메모. 자동 경계·수치·결과·통계에는 영향을 주지 않는다.';


alter table public.battle_engagement_source_observations enable row level security;
alter table public.battle_engagement_runs enable row level security;
alter table public.battle_engagements enable row level security;
alter table public.battle_engagement_matchups enable row level security;
alter table public.battle_engagement_event_links enable row level security;
alter table public.battle_engagement_notes enable row level security;

revoke all on public.battle_engagement_source_observations from public, anon, authenticated;
revoke all on public.battle_engagement_runs from public, anon, authenticated;
revoke all on public.battle_engagements from public, anon, authenticated;
revoke all on public.battle_engagement_matchups from public, anon, authenticated;
revoke all on public.battle_engagement_event_links from public, anon, authenticated;
revoke all on public.battle_engagement_notes from public, anon, authenticated;

-- Migration 238 grants service_role broad default table privileges. Revoke
-- those defaults here so all official projection writes must pass through the
-- validated observe/publish functions below.
revoke all on public.battle_engagement_source_observations from service_role;
revoke all on public.battle_engagement_runs from service_role;
revoke all on public.battle_engagements from service_role;
revoke all on public.battle_engagement_matchups from service_role;
revoke all on public.battle_engagement_event_links from service_role;
revoke all on public.battle_engagement_notes from service_role;

grant select
  on public.battle_engagement_source_observations to service_role;
grant select
  on public.battle_engagement_runs to service_role;
grant select
  on public.battle_engagements to service_role;
grant select
  on public.battle_engagement_matchups to service_role;
grant select
  on public.battle_engagement_event_links to service_role;
grant select, insert, update, delete
  on public.battle_engagement_notes to service_role;


create or replace function public.observe_battle_engagement_source(
  p_battle_record_id uuid,
  p_source_hash text,
  p_observed_at timestamptz,
  p_observation_token uuid
)
returns table (
  observed_source_hash text,
  consecutive_observations integer,
  source_changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_hash text;
  v_current_source_hash text;
  v_previous_token uuid;
  v_count integer;
  v_changed boolean;
begin
  if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_BATTLE_SOURCE_HASH';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('battle-engagement-source:' || p_battle_record_id::text, 0)
  );

  if p_observation_token is null then
    raise exception 'INVALID_BATTLE_OBSERVATION_TOKEN';
  end if;

  select br.engagement_source_hash
    into v_current_source_hash
    from public.battle_records br
   where br.id = p_battle_record_id
   for share;

  if not found then
    raise exception 'BATTLE_RECORD_NOT_FOUND';
  end if;

  if v_current_source_hash is distinct from p_source_hash then
    raise exception 'STALE_BATTLE_ENGAGEMENT_SOURCE';
  end if;

  select observation.source_hash, observation.last_observation_token
    into v_previous_hash, v_previous_token
    from public.battle_engagement_source_observations observation
   where observation.battle_record_id = p_battle_record_id
   for update;

  if not found then
    insert into public.battle_engagement_source_observations (
      battle_record_id,
      source_hash,
      consecutive_observations,
      first_observed_at,
      last_observed_at,
      source_changed_at,
      last_observation_token,
      updated_at
    )
    values (
      p_battle_record_id,
      p_source_hash,
      1,
      p_observed_at,
      p_observed_at,
      p_observed_at,
      p_observation_token,
      p_observed_at
    );
    v_count := 1;
    v_changed := true;
  elsif v_previous_hash = p_source_hash and v_previous_token = p_observation_token then
    select observation.consecutive_observations
      into v_count
      from public.battle_engagement_source_observations observation
     where observation.battle_record_id = p_battle_record_id;
    v_changed := false;
  elsif v_previous_hash = p_source_hash then
    update public.battle_engagement_source_observations observation
       set consecutive_observations = least(
             observation.consecutive_observations + 1,
             2147483647
           ),
           last_observed_at = greatest(observation.last_observed_at, p_observed_at),
           last_observation_token = p_observation_token,
           updated_at = p_observed_at
     where observation.battle_record_id = p_battle_record_id
    returning observation.consecutive_observations into v_count;
    v_changed := false;
  else
    update public.battle_engagement_source_observations observation
       set source_hash = p_source_hash,
           consecutive_observations = 1,
           first_observed_at = p_observed_at,
           last_observed_at = p_observed_at,
           source_changed_at = p_observed_at,
           last_observation_token = p_observation_token,
           updated_at = p_observed_at
     where observation.battle_record_id = p_battle_record_id;
    v_count := 1;
    v_changed := true;
  end if;

  return query
  select p_source_hash, v_count, v_changed;
end;
$$;

revoke all on function public.observe_battle_engagement_source(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.observe_battle_engagement_source(uuid, text, timestamptz, uuid)
  to service_role;


create or replace function public.publish_battle_engagement_projection(
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
as $$
declare
  v_observed_hash text;
  v_observation_count integer;
  v_current_source_hash text;
  v_albion_battle_id bigint;
  v_raw_battle jsonb;
  v_raw_home_kills integer;
  v_raw_home_deaths integer;
  v_home_guild_team_size integer;
  v_home_side_team_size integer;
  v_home_alliance_id text;
  v_projected_home_kills integer;
  v_projected_home_deaths integer;
  v_projected_unidentified_count integer;
  v_projected_ignored_count integer;
  v_run_id uuid;
  v_engagement_id uuid;
  v_engagement jsonb;
  v_matchup jsonb;
  v_event jsonb;
begin
  if p_projection is null or jsonb_typeof(p_projection) <> 'object' then
    raise exception 'INVALID_BATTLE_ENGAGEMENT_PROJECTION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_battle_record_id::text, 0)
  );

  if not exists (
    select 1
      from public.app_settings setting
     where setting.guild_id = p_guild_id
       and setting.key = 'albion_home_guild_id'
       and btrim(setting.value) = p_home_guild_id
  ) then
    raise exception 'BATTLE_TENANT_SCOPE_MISMATCH';
  end if;

  select
    br.engagement_source_hash,
    br.albion_battle_id,
    br.raw_battle,
    coalesce(
      nullif(br.raw_battle->'guilds'->p_home_guild_id->>'kills', ''),
      '0'
    )::integer,
    coalesce(
      nullif(br.raw_battle->'guilds'->p_home_guild_id->>'deaths', ''),
      '0'
    )::integer
    into
      v_current_source_hash,
      v_albion_battle_id,
      v_raw_battle,
      v_raw_home_kills,
      v_raw_home_deaths
    from public.battle_records br
   where br.id = p_battle_record_id
     and p_home_guild_id = any(br.involved_guild_ids)
   for update;

  if not found then
    raise exception 'BATTLE_HOME_GUILD_NOT_INVOLVED';
  end if;

  if v_current_source_hash is distinct from p_source_hash then
    raise exception 'STALE_BATTLE_ENGAGEMENT_SOURCE';
  end if;

  v_home_alliance_id := nullif(
    v_raw_battle->'guilds'->p_home_guild_id->>'allianceId',
    ''
  );
  select
    count(*) filter (
      where player.value->>'guildId' = p_home_guild_id
    )::integer,
    count(*) filter (
      where (
        v_home_alliance_id is not null
        and nullif(player.value->>'allianceId', '') = v_home_alliance_id
      )
      or (
        v_home_alliance_id is null
        and player.value->>'guildId' = p_home_guild_id
      )
    )::integer
    into v_home_guild_team_size, v_home_side_team_size
    from jsonb_each(
      coalesce(v_raw_battle->'players', '{}'::jsonb)
    ) player;

  select observation.source_hash, observation.consecutive_observations
    into v_observed_hash, v_observation_count
    from public.battle_engagement_source_observations observation
   where observation.battle_record_id = p_battle_record_id
   for update;

  if not found or v_observed_hash <> p_source_hash then
    raise exception 'STALE_BATTLE_ENGAGEMENT_SOURCE';
  end if;

  if p_projection->>'sourceHash' <> p_source_hash then
    raise exception 'BATTLE_ENGAGEMENT_HASH_MISMATCH';
  end if;

  v_projected_home_kills := (p_projection->>'rawHomeKills')::integer;
  v_projected_home_deaths := (p_projection->>'rawHomeDeaths')::integer;
  if (
    v_projected_home_kills is distinct from v_raw_home_kills
    or v_projected_home_deaths is distinct from v_raw_home_deaths
  ) then
    raise exception 'BATTLE_ENGAGEMENT_RAW_TOTAL_MISMATCH';
  end if;

  if v_observation_count < 2 and (
    p_projection->>'state' <> 'collecting'
    or p_projection->>'reason' <> 'source_not_stable'
  ) then
    raise exception 'BATTLE_ENGAGEMENT_SOURCE_NOT_STABLE';
  end if;

  insert into public.battle_engagement_runs (
    guild_id,
    battle_record_id,
    home_guild_id,
    source_hash,
    source_observation_count,
    state,
    reason,
    raw_home_kills,
    raw_home_deaths,
    collected_home_kills,
    collected_home_deaths,
    unidentified_event_count,
    ignored_non_home_event_count,
    evaluated_at,
    updated_at
  )
  values (
    p_guild_id,
    p_battle_record_id,
    p_home_guild_id,
    p_source_hash,
    v_observation_count,
    p_projection->>'state',
    p_projection->>'reason',
    (p_projection->>'rawHomeKills')::integer,
    (p_projection->>'rawHomeDeaths')::integer,
    (p_projection->>'collectedHomeKills')::integer,
    (p_projection->>'collectedHomeDeaths')::integer,
    (p_projection->>'unidentifiedEventCount')::integer,
    (p_projection->>'ignoredNonHomeEventCount')::integer,
    (p_projection->>'evaluatedAt')::timestamptz,
    now()
  )
  on conflict (guild_id, battle_record_id)
  do update set
    home_guild_id = excluded.home_guild_id,
    source_hash = excluded.source_hash,
    source_observation_count = excluded.source_observation_count,
    state = excluded.state,
    reason = excluded.reason,
    raw_home_kills = excluded.raw_home_kills,
    raw_home_deaths = excluded.raw_home_deaths,
    collected_home_kills = excluded.collected_home_kills,
    collected_home_deaths = excluded.collected_home_deaths,
    unidentified_event_count = excluded.unidentified_event_count,
    ignored_non_home_event_count = excluded.ignored_non_home_event_count,
    evaluated_at = excluded.evaluated_at,
    updated_at = now()
  returning id into v_run_id;

  -- All child replacement is inside this function transaction. Any invalid
  -- child aborts the whole publication and keeps the previous projection.
  delete from public.battle_engagement_event_links link
   where link.guild_id = p_guild_id
     and link.run_id = v_run_id;

  delete from public.battle_engagements engagement
   where engagement.guild_id = p_guild_id
     and engagement.run_id = v_run_id;

  for v_engagement in
    select value
      from jsonb_array_elements(
        coalesce(p_projection->'engagements', '[]'::jsonb)
      )
  loop
    if (
      (p_projection->>'state' = 'collecting' and v_engagement->>'status' <> 'pending')
      or (
        p_projection->>'state' = 'segmentation_required'
        and v_engagement->>'status' <> 'segmentation_required'
      )
      or (p_projection->>'state' = 'blocked' and v_engagement->>'status' <> 'blocked')
      or (
        p_projection->>'state' = 'ready'
        and v_engagement->>'status' not in ('final', 'insufficient_evidence')
      )
    ) then
      raise exception 'BATTLE_ENGAGEMENT_RUN_STATUS_MISMATCH';
    end if;

    insert into public.battle_engagements (
      guild_id,
      run_id,
      engagement_key,
      sequence,
      started_at,
      ended_at,
      status,
      result,
      home_kills,
      home_deaths,
      home_kill_fame,
      opponent_kills,
      opponent_deaths,
      opponent_kill_fame,
      result_home_kills,
      result_home_deaths,
      result_home_kill_fame,
      result_opponent_kills,
      result_opponent_deaths,
      result_opponent_kill_fame,
      result_eligible_event_count,
      intervention_event_count,
      other_event_count,
      home_team_size,
      home_side_team_size,
      is_other_only,
      updated_at
    )
    values (
      p_guild_id,
      v_run_id,
      v_engagement->>'engagementKey',
      (v_engagement->>'sequence')::integer,
      (v_engagement->>'startedAt')::timestamptz,
      (v_engagement->>'endedAt')::timestamptz,
      v_engagement->>'status',
      nullif(v_engagement->>'result', ''),
      (v_engagement->>'homeKills')::integer,
      (v_engagement->>'homeDeaths')::integer,
      (v_engagement->>'homeKillFame')::bigint,
      (v_engagement->>'opponentKills')::integer,
      (v_engagement->>'opponentDeaths')::integer,
      (v_engagement->>'opponentKillFame')::bigint,
      (v_engagement->>'resultHomeKills')::integer,
      (v_engagement->>'resultHomeDeaths')::integer,
      (v_engagement->>'resultHomeKillFame')::bigint,
      (v_engagement->>'resultOpponentKills')::integer,
      (v_engagement->>'resultOpponentDeaths')::integer,
      (v_engagement->>'resultOpponentKillFame')::bigint,
      (v_engagement->>'resultEligibleEventCount')::integer,
      (v_engagement->>'interventionEventCount')::integer,
      (v_engagement->>'otherEventCount')::integer,
      (v_engagement->>'homeTeamSize')::integer,
      (v_engagement->>'homeSideTeamSize')::integer,
      coalesce((v_engagement->>'isOtherOnly')::boolean, false),
      now()
    )
    returning id into v_engagement_id;

    for v_matchup in
      select value
        from jsonb_array_elements(
          coalesce(v_engagement->'matchups', '[]'::jsonb)
        )
    loop
      insert into public.battle_engagement_matchups (
        guild_id,
        run_id,
        engagement_id,
        force_key,
        force_kind,
        force_albion_id,
        force_name,
        opponent_alliance_id,
        opponent_team_size,
        matchup_role,
        event_count,
        home_kills,
        home_deaths,
        home_kill_fame,
        opponent_kills,
        opponent_deaths,
        opponent_kill_fame
      )
      values (
        p_guild_id,
        v_run_id,
        v_engagement_id,
        v_matchup->>'forceKey',
        v_matchup->>'forceKind',
        v_matchup->>'forceAlbionId',
        v_matchup->>'forceName',
        nullif(v_matchup->>'opponentAllianceId', ''),
        (v_matchup->>'opponentTeamSize')::integer,
        v_matchup->>'role',
        (v_matchup->>'eventCount')::integer,
        (v_matchup->>'homeKills')::integer,
        (v_matchup->>'homeDeaths')::integer,
        (v_matchup->>'homeKillFame')::bigint,
        (v_matchup->>'opponentKills')::integer,
        (v_matchup->>'opponentDeaths')::integer,
        (v_matchup->>'opponentKillFame')::bigint
      );
    end loop;

    for v_event in
      select value
        from jsonb_array_elements(
          coalesce(v_engagement->'events', '[]'::jsonb)
        )
    loop
      insert into public.battle_engagement_event_links (
        guild_id,
        run_id,
        engagement_id,
        event_id,
        role,
        occurred_at,
        fame,
        classification,
        other_reason,
        force_key,
        force_kind,
        force_albion_id,
        force_name,
        opponent_guild_id,
        opponent_guild_name,
        opponent_alliance_id,
        opponent_alliance_name
      )
      values (
        p_guild_id,
        v_run_id,
        v_engagement_id,
        (v_event->>'eventId')::bigint,
        v_event->>'role',
        (v_event->>'occurredAt')::timestamptz,
        (v_event->>'fame')::bigint,
        v_event->>'classification',
        nullif(v_event->>'otherReason', ''),
        nullif(v_event->>'forceKey', ''),
        nullif(v_event->>'forceKind', ''),
        nullif(v_event->>'forceAlbionId', ''),
        nullif(v_event->>'forceName', ''),
        nullif(v_event->>'opponentGuildId', ''),
        nullif(v_event->>'opponentGuildName', ''),
        nullif(v_event->>'opponentAllianceId', ''),
        nullif(v_event->>'opponentAllianceName', '')
      );
    end loop;
  end loop;

  for v_event in
    select value
      from jsonb_array_elements(
        coalesce(p_projection->'unassignedEvents', '[]'::jsonb)
      )
  loop
    insert into public.battle_engagement_event_links (
      guild_id,
      run_id,
      engagement_id,
      event_id,
      role,
      occurred_at,
      fame,
      classification,
      other_reason,
      force_key,
      force_kind,
      force_albion_id,
      force_name,
      opponent_guild_id,
      opponent_guild_name,
      opponent_alliance_id,
      opponent_alliance_name
    )
    values (
      p_guild_id,
      v_run_id,
      null,
      (v_event->>'eventId')::bigint,
      v_event->>'role',
      (v_event->>'occurredAt')::timestamptz,
      (v_event->>'fame')::bigint,
      v_event->>'classification',
      nullif(v_event->>'otherReason', ''),
      nullif(v_event->>'forceKey', ''),
      nullif(v_event->>'forceKind', ''),
      nullif(v_event->>'forceAlbionId', ''),
      nullif(v_event->>'forceName', ''),
      nullif(v_event->>'opponentGuildId', ''),
      nullif(v_event->>'opponentGuildName', ''),
      nullif(v_event->>'opponentAllianceId', ''),
      nullif(v_event->>'opponentAllianceName', '')
    );
  end loop;

  if exists (
    select 1
      from public.battle_engagement_event_links link
     where link.guild_id = p_guild_id
       and link.run_id = v_run_id
       and not exists (
         select 1
           from public.killboard_events event
          where event.guild_id = link.guild_id
            and event.event_id = link.event_id
            and event.role = link.role
            and event.battle_id = v_albion_battle_id
            and event.occurred_at = link.occurred_at
            and event.fame::bigint = link.fame
            and (
              link.classification = 'unidentified'
              or (
                event.fame_is_observed
                and (
                  (
                    link.classification = 'not_home_source'
                    and event.source_guild_id is distinct from p_home_guild_id
                  )
                  or (
                    link.classification <> 'not_home_source'
                    and event.source_guild_id = p_home_guild_id
                  )
                )
              )
            )
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_EVENT_SOURCE_MISMATCH';
  end if;

  if exists (
    select 1
      from public.battle_engagement_event_links link
     where link.guild_id = p_guild_id
       and link.run_id = v_run_id
       and (
         (
           link.classification in ('unidentified', 'not_home_source')
           and link.engagement_id is not null
         )
         or (
           link.classification not in ('unidentified', 'not_home_source')
           and link.engagement_id is null
         )
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_EVENT_ASSIGNMENT_MISMATCH';
  end if;

  -- Every result-bearing opponent force must be derivable from the raw battle
  -- identity and satisfy the 10-player condition. This prevents a projection
  -- payload from inventing a force, alliance, or team size.
  if exists (
    select 1
      from public.battle_engagement_event_links link
      cross join lateral (
        select nullif(
          v_raw_battle->'guilds'->link.opponent_guild_id->>'allianceId',
          ''
        ) as raw_alliance_id
      ) opponent
      cross join lateral (
        select count(*)::integer as team_size
          from jsonb_each(
            coalesce(v_raw_battle->'players', '{}'::jsonb)
          ) player
         where (
           opponent.raw_alliance_id is not null
           and nullif(player.value->>'allianceId', '') =
             opponent.raw_alliance_id
         )
         or (
           opponent.raw_alliance_id is null
           and player.value->>'guildId' = link.opponent_guild_id
         )
      ) force
     where link.guild_id = p_guild_id
       and link.run_id = v_run_id
       and link.classification in ('result_eligible', 'intervention')
       and (
         link.opponent_guild_id is null
         or not (v_raw_battle->'guilds' ? link.opponent_guild_id)
         or link.opponent_guild_id = p_home_guild_id
         or (
           v_home_alliance_id is not null
           and opponent.raw_alliance_id = v_home_alliance_id
         )
         or v_home_side_team_size < 10
         or force.team_size < 10
         or (
           opponent.raw_alliance_id is not null
           and (
             link.force_kind <> 'alliance'
             or link.force_albion_id <> opponent.raw_alliance_id
             or link.force_key <> 'a:' || opponent.raw_alliance_id
             or link.opponent_alliance_id is distinct from
               opponent.raw_alliance_id
           )
         )
         or (
           opponent.raw_alliance_id is null
           and (
             link.force_kind <> 'guild'
             or link.force_albion_id <> link.opponent_guild_id
             or link.force_key <> 'g:' || link.opponent_guild_id
             or link.opponent_alliance_id is not null
           )
         )
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_FORCE_SOURCE_MISMATCH';
  end if;

  if exists (
    select 1
      from public.battle_engagements engagement
      left join lateral (
        select
          count(*) filter (
            where link.classification not in ('unidentified', 'not_home_source')
              and link.role = 'killer'
          )::integer as home_kills,
          count(*) filter (
            where link.classification not in ('unidentified', 'not_home_source')
              and link.role = 'victim'
          )::integer as home_deaths,
          coalesce(sum(link.fame) filter (
            where link.classification not in ('unidentified', 'not_home_source')
              and link.role = 'killer'
          ), 0)::bigint as home_kill_fame,
          coalesce(sum(link.fame) filter (
            where link.classification not in ('unidentified', 'not_home_source')
              and link.role = 'victim'
          ), 0)::bigint as opponent_kill_fame,
          count(*) filter (
            where link.classification = 'result_eligible'
              and link.role = 'killer'
          )::integer as result_home_kills,
          count(*) filter (
            where link.classification = 'result_eligible'
              and link.role = 'victim'
          )::integer as result_home_deaths,
          coalesce(sum(link.fame) filter (
            where link.classification = 'result_eligible'
              and link.role = 'killer'
          ), 0)::bigint as result_home_kill_fame,
          coalesce(sum(link.fame) filter (
            where link.classification = 'result_eligible'
              and link.role = 'victim'
          ), 0)::bigint as result_opponent_kill_fame,
          count(*) filter (
            where link.classification = 'result_eligible'
          )::integer as result_event_count,
          count(*) filter (
            where link.classification = 'intervention'
          )::integer as intervention_event_count,
          count(*) filter (
            where link.classification = 'other'
          )::integer as other_event_count
        from public.battle_engagement_event_links link
        where link.guild_id = engagement.guild_id
          and link.run_id = engagement.run_id
          and link.engagement_id = engagement.id
      ) totals on true
     where engagement.guild_id = p_guild_id
       and engagement.run_id = v_run_id
       and (
         engagement.home_kills <> totals.home_kills
         or engagement.home_deaths <> totals.home_deaths
         or engagement.home_kill_fame <> totals.home_kill_fame
         or engagement.opponent_kills <> totals.home_deaths
         or engagement.opponent_deaths <> totals.home_kills
         or engagement.opponent_kill_fame <> totals.opponent_kill_fame
         or engagement.result_home_kills <> totals.result_home_kills
         or engagement.result_home_deaths <> totals.result_home_deaths
         or engagement.result_home_kill_fame <> totals.result_home_kill_fame
         or engagement.result_opponent_kills <> totals.result_home_deaths
         or engagement.result_opponent_deaths <> totals.result_home_kills
         or engagement.result_opponent_kill_fame <> totals.result_opponent_kill_fame
         or engagement.result_eligible_event_count <> totals.result_event_count
         or engagement.intervention_event_count <> totals.intervention_event_count
         or engagement.other_event_count <> totals.other_event_count
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_TOTAL_MISMATCH';
  end if;

  if exists (
    select 1
      from public.battle_engagement_matchups matchup
      left join lateral (
        select
          count(*)::integer as event_count,
          count(*) filter (where link.role = 'killer')::integer as home_kills,
          count(*) filter (where link.role = 'victim')::integer as home_deaths,
          coalesce(sum(link.fame) filter (
            where link.role = 'killer'
          ), 0)::bigint as home_kill_fame,
          coalesce(sum(link.fame) filter (
            where link.role = 'victim'
          ), 0)::bigint as opponent_kill_fame,
          min(link.classification) as min_classification,
          max(link.classification) as max_classification,
          min(link.force_kind) as force_kind,
          min(link.force_albion_id) as force_albion_id,
          min(link.force_name) as force_name,
          min(link.opponent_alliance_id) as opponent_alliance_id
        from public.battle_engagement_event_links link
        where link.guild_id = matchup.guild_id
          and link.run_id = matchup.run_id
          and link.engagement_id = matchup.engagement_id
          and link.force_key = matchup.force_key
          and link.classification in ('result_eligible', 'intervention')
      ) totals on true
      left join lateral (
        select
          count(*)::integer as force_count,
          coalesce(max(force_events.event_count), 0)::integer as max_event_count
        from (
          select count(*)::integer as event_count
            from public.battle_engagement_event_links sibling
           where sibling.guild_id = matchup.guild_id
             and sibling.run_id = matchup.run_id
             and sibling.engagement_id = matchup.engagement_id
             and sibling.classification in ('result_eligible', 'intervention')
           group by sibling.force_key
        ) force_events
      ) block on true
      left join lateral (
        select count(*)::integer as team_size
          from jsonb_each(
            coalesce(v_raw_battle->'players', '{}'::jsonb)
          ) player
         where (
           matchup.force_kind = 'alliance'
           and nullif(player.value->>'allianceId', '') =
             matchup.force_albion_id
         )
         or (
           matchup.force_kind = 'guild'
           and player.value->>'guildId' = matchup.force_albion_id
         )
      ) force on true
     where matchup.guild_id = p_guild_id
       and matchup.run_id = v_run_id
       and (
         totals.event_count = 0
         or matchup.event_count <> totals.event_count
         or matchup.home_kills <> totals.home_kills
         or matchup.home_deaths <> totals.home_deaths
         or matchup.home_kill_fame <> totals.home_kill_fame
         or matchup.opponent_kills <> totals.home_deaths
         or matchup.opponent_deaths <> totals.home_kills
         or matchup.opponent_kill_fame <> totals.opponent_kill_fame
         or totals.min_classification <> totals.max_classification
         or matchup.matchup_role <> totals.min_classification
         or matchup.force_kind <> totals.force_kind
         or matchup.force_albion_id <> totals.force_albion_id
         or matchup.force_name <> totals.force_name
         or matchup.opponent_alliance_id is distinct from
           totals.opponent_alliance_id
         or matchup.opponent_team_size <> force.team_size
         or matchup.matchup_role <> (
           case
             when block.force_count > 1
              and block.max_event_count >= 2
              and totals.event_count = 1
             then 'intervention'
             else 'result_eligible'
           end
         )
       )
  ) or exists (
    select 1
      from public.battle_engagement_event_links link
     where link.guild_id = p_guild_id
       and link.run_id = v_run_id
       and link.classification in ('result_eligible', 'intervention')
       and not exists (
         select 1
           from public.battle_engagement_matchups matchup
          where matchup.guild_id = link.guild_id
            and matchup.run_id = link.run_id
            and matchup.engagement_id = link.engagement_id
            and matchup.force_key = link.force_key
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_MATCHUP_MISMATCH';
  end if;

  if exists (
    select 1
      from public.battle_engagements engagement
     where engagement.guild_id = p_guild_id
       and engagement.run_id = v_run_id
       and (
         engagement.home_team_size <> v_home_guild_team_size
         or engagement.home_side_team_size <> v_home_side_team_size
         or engagement.is_other_only <>
           (engagement.result_eligible_event_count = 0
             and engagement.intervention_event_count = 0)
         or (
           p_projection->>'state' = 'ready'
           and (
             (
               engagement.result_eligible_event_count < 5
               and engagement.status <> 'insufficient_evidence'
             )
             or (
               engagement.result_eligible_event_count >= 5
               and (
                 engagement.status <> 'final'
                 or engagement.result is distinct from (
                   case
                     when engagement.result_home_kills >
                            engagement.result_home_deaths
                      and engagement.result_home_kills::numeric * 100 >=
                            engagement.result_home_deaths::numeric * 120
                      and engagement.result_home_kill_fame >
                            engagement.result_opponent_kill_fame
                      and engagement.result_home_kill_fame::numeric * 100 >=
                            engagement.result_opponent_kill_fame::numeric * 120
                     then 'advantage'
                     when engagement.result_home_deaths >
                            engagement.result_home_kills
                      and engagement.result_home_deaths::numeric * 100 >=
                            engagement.result_home_kills::numeric * 120
                      and engagement.result_opponent_kill_fame >
                            engagement.result_home_kill_fame
                      and engagement.result_opponent_kill_fame::numeric * 100 >=
                            engagement.result_home_kill_fame::numeric * 120
                     then 'disadvantage'
                     else 'even'
                   end
                 )
               )
             )
           )
         )
       )
  ) then
    raise exception 'BATTLE_ENGAGEMENT_RESULT_MISMATCH';
  end if;

  select
    coalesce(sum(engagement.home_kills), 0)::integer,
    coalesce(sum(engagement.home_deaths), 0)::integer
    into v_projected_home_kills, v_projected_home_deaths
    from public.battle_engagements engagement
   where engagement.guild_id = p_guild_id
     and engagement.run_id = v_run_id;

  if (
    v_projected_home_kills
      is distinct from (p_projection->>'collectedHomeKills')::integer
    or v_projected_home_deaths
      is distinct from (p_projection->>'collectedHomeDeaths')::integer
  ) then
    raise exception 'BATTLE_ENGAGEMENT_COLLECTED_TOTAL_MISMATCH';
  end if;

  select
    count(*) filter (
      where link.classification = 'unidentified'
    )::integer,
    count(*) filter (
      where link.classification = 'not_home_source'
    )::integer
    into v_projected_unidentified_count, v_projected_ignored_count
    from public.battle_engagement_event_links link
   where link.guild_id = p_guild_id
     and link.run_id = v_run_id;

  if (
    v_projected_unidentified_count
      is distinct from (p_projection->>'unidentifiedEventCount')::integer
    or v_projected_ignored_count
      is distinct from (p_projection->>'ignoredNonHomeEventCount')::integer
  ) then
    raise exception 'BATTLE_ENGAGEMENT_CLASSIFICATION_TOTAL_MISMATCH';
  end if;

  return v_run_id;
end;
$$;

revoke all on function public.publish_battle_engagement_projection(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_battle_engagement_projection(uuid, uuid, text, text, jsonb)
  to service_role;


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
  note.updated_at as note_updated_at
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
  '현재 source hash와 일치하는 tenant 교전 projection만 노출. 원본이 바뀐 순간 이전 결과는 자동으로 숨겨진다.';


create or replace view public.battle_engagement_result_stats
with (security_invoker = true)
as
select
  gbe.tenant_id as guild_id,
  gbe.battle_record_id,
  gbe.engagement_id,
  gbe.started_at,
  gbe.ended_at,
  gbe.result,
  case
    when gbe.result = 'advantage' then 'win'
    when gbe.result = 'disadvantage' then 'loss'
    else 'tie'
  end as legacy_outcome
from public.guild_battle_engagements gbe
where gbe.run_state = 'ready'
  and gbe.status = 'final'
  and gbe.result is not null;

revoke all on public.battle_engagement_result_stats from public, anon, authenticated;
grant select on public.battle_engagement_result_stats to service_role;

comment on view public.battle_engagement_result_stats is
  '공식 결과 기반 통계에 사용할 수 있는 확정 engagement만 노출. 판정 중·구분 필요·차단·근거 부족은 제외.';
