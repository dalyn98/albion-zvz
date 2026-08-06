-- Exact UTC season boundaries.
--
-- Daily snapshot keys remain dates, but battle inclusion must respect the
-- server-specific start instant and an explicit exclusive end instant.

alter table public.zvz_seasons
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.zvz_seasons
  drop constraint if exists zvz_seasons_start_date_matches,
  add constraint zvz_seasons_start_date_matches check (
    starts_at is null
    or (starts_at at time zone 'UTC')::date = starts_on
  ),
  drop constraint if exists zvz_seasons_end_after_start,
  add constraint zvz_seasons_end_after_start check (
    ends_at is null
    or ends_at > coalesce(
      starts_at,
      starts_on::timestamp at time zone 'UTC'
    )
  );

create index if not exists idx_zvz_seasons_server_start_at
  on public.zvz_seasons (
    albion_server,
    coalesce(starts_at, starts_on::timestamp at time zone 'UTC') desc
  );

comment on column public.zvz_seasons.starts_at is
  'Exact inclusive Albion season start instant in UTC. starts_on remains the daily snapshot key.';
comment on column public.zvz_seasons.ends_at is
  'Optional exact exclusive Albion season end instant in UTC. The earlier of this and the next season start wins.';

create or replace function public.get_public_zvz_season_bounds(
  p_season_id uuid
)
returns table (
  albion_server text,
  starts_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  last_snapshot_date date
)
language sql
stable
security definer
set search_path = public
as $$
  with selected as (
    select
      season.id,
      season.albion_server,
      season.starts_on,
      coalesce(
        season.starts_at,
        season.starts_on::timestamp at time zone 'UTC'
      ) as starts_at,
      season.ends_at as configured_ends_at
    from public.zvz_seasons season
    where season.id = p_season_id
  ),
  bounded as (
    select
      selected.*,
      (
        select min(coalesce(
          next_season.starts_at,
          next_season.starts_on::timestamp at time zone 'UTC'
        ))
        from public.zvz_seasons next_season
        where next_season.albion_server = selected.albion_server
          and coalesce(
            next_season.starts_at,
            next_season.starts_on::timestamp at time zone 'UTC'
          ) > selected.starts_at
      ) as next_starts_at
    from selected
  ),
  effective as (
    select
      bounded.*,
      case
        when bounded.configured_ends_at is null then bounded.next_starts_at
        when bounded.next_starts_at is null then bounded.configured_ends_at
        else least(bounded.configured_ends_at, bounded.next_starts_at)
      end as effective_ends_at
    from bounded
  )
  select
    effective.albion_server,
    effective.starts_on,
    effective.starts_at,
    effective.effective_ends_at,
    case
      when effective.effective_ends_at is null then null
      else (
        (effective.effective_ends_at - interval '1 microsecond')
        at time zone 'UTC'
      )::date
    end as last_snapshot_date
  from effective;
$$;

revoke all on function public.get_public_zvz_season_bounds(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_zvz_season_bounds(uuid)
  to service_role;

create or replace function public.save_public_zvz_season(
  p_season_id uuid,
  p_albion_server text,
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_actor_discord_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_season_id;
  v_existing public.zvz_seasons%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_starts_on date;
  v_boundaries_changed boolean := false;
begin
  if p_albion_server is null
     or p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'season name must be 1-80 characters';
  end if;
  if p_starts_at is null then
    raise exception 'season start instant is required';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'season end instant must be after its start';
  end if;

  v_starts_on := (p_starts_at at time zone 'UTC')::date;

  perform pg_advisory_xact_lock(
    hashtextextended('public-zvz-seasons:' || p_albion_server, 0)
  );

  if v_id is null then
    insert into public.zvz_seasons (
      albion_server,
      name,
      starts_on,
      starts_at,
      ends_at,
      created_by_discord_id,
      updated_by_discord_id
    ) values (
      p_albion_server,
      v_name,
      v_starts_on,
      p_starts_at,
      p_ends_at,
      nullif(btrim(coalesce(p_actor_discord_id, '')), ''),
      nullif(btrim(coalesce(p_actor_discord_id, '')), '')
    )
    returning id into v_id;
    v_boundaries_changed := true;
  else
    select *
      into v_existing
      from public.zvz_seasons
     where id = v_id
     for update;

    if not found then
      raise exception 'season not found';
    end if;
    if v_existing.albion_server <> p_albion_server then
      raise exception 'season server cannot be changed';
    end if;

    v_boundaries_changed :=
      v_existing.starts_on is distinct from v_starts_on
      or coalesce(
        v_existing.starts_at,
        v_existing.starts_on::timestamp at time zone 'UTC'
      ) is distinct from p_starts_at
      or v_existing.ends_at is distinct from p_ends_at;

    update public.zvz_seasons
       set name = v_name,
           starts_on = v_starts_on,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           updated_by_discord_id = nullif(
             btrim(coalesce(p_actor_discord_id, '')),
             ''
           ),
           updated_at = now()
     where id = v_id;
  end if;

  return jsonb_build_object(
    'season_id', v_id,
    'albion_server', p_albion_server,
    'name', v_name,
    'starts_on', v_starts_on,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'boundaries_changed', v_boundaries_changed
  );
end;
$$;

revoke all on function public.save_public_zvz_season(
  uuid, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.save_public_zvz_season(
  uuid, text, text, timestamptz, timestamptz, text
) to service_role;

-- Preserve the date-only RPC for any older deployed server action during the
-- rollout. It intentionally represents an open-ended midnight UTC season.
create or replace function public.save_public_zvz_season(
  p_season_id uuid,
  p_albion_server text,
  p_name text,
  p_starts_on date,
  p_actor_discord_id text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.save_public_zvz_season(
    p_season_id,
    p_albion_server,
    p_name,
    p_starts_on::timestamp at time zone 'UTC',
    null::timestamptz,
    p_actor_discord_id
  );
$$;

revoke all on function public.save_public_zvz_season(
  uuid, text, text, date, text
) from public, anon, authenticated;
grant execute on function public.save_public_zvz_season(
  uuid, text, text, date, text
) to service_role;

create or replace function public.invalidate_public_zvz_season_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servers text[];
begin
  if tg_op = 'UPDATE'
     and old.albion_server is not distinct from new.albion_server
     and old.starts_on is not distinct from new.starts_on
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_servers := array[new.albion_server];
  elsif tg_op = 'DELETE' then
    v_servers := array[old.albion_server];
  else
    v_servers := array[old.albion_server, new.albion_server];
  end if;

  delete from public.zvz_season_snapshots snapshot
   using public.zvz_seasons season
   where snapshot.season_id = season.id
     and season.albion_server = any(v_servers);

  delete from public.public_zvz_v2_season_snapshots snapshot
   using public.zvz_seasons season
   where snapshot.season_id = season.id
     and season.albion_server = any(v_servers);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.invalidate_public_zvz_season_snapshots()
  from public, anon, authenticated;

create or replace function public.enforce_public_zvz_season_evidence_bounds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounds record;
begin
  select * into v_bounds
  from public.get_public_zvz_season_bounds(new.season_id);

  if not found then
    raise exception 'season not found for evidence row';
  end if;

  if new.battle_started_at < v_bounds.starts_at
     or (
       v_bounds.ends_at is not null
       and new.battle_started_at >= v_bounds.ends_at
     ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_public_zvz_season_evidence_bounds()
  from public, anon, authenticated;

drop trigger if exists trg_guild_season_zvz_evidence_bounds
  on public.guild_season_zvz_battle_evidence;
create trigger trg_guild_season_zvz_evidence_bounds
before insert or update of season_id, battle_started_at
on public.guild_season_zvz_battle_evidence
for each row execute function public.enforce_public_zvz_season_evidence_bounds();

drop trigger if exists trg_public_zvz_v2_evidence_bounds
  on public.public_zvz_v2_season_evidence;
create trigger trg_public_zvz_v2_evidence_bounds
before insert or update of season_id, battle_started_at
on public.public_zvz_v2_season_evidence
for each row execute function public.enforce_public_zvz_season_evidence_bounds();

-- Keep the audited date-based rebuild bodies intact. The wrappers cap the
-- generated snapshot days, while evidence triggers enforce exact instants.
alter function public.refresh_guild_zvz_season_snapshots(uuid, date, boolean)
  rename to refresh_guild_zvz_season_snapshots_date_legacy;
revoke all on function public.refresh_guild_zvz_season_snapshots_date_legacy(
  uuid, date, boolean
) from public, anon, authenticated, service_role;

create function public.refresh_guild_zvz_season_snapshots(
  p_season_id uuid,
  p_through_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounds record;
  v_through_date date;
begin
  select * into v_bounds
  from public.get_public_zvz_season_bounds(p_season_id);
  if not found then raise exception 'season not found'; end if;

  v_through_date := least(
    coalesce(p_through_date, (clock_timestamp() at time zone 'UTC')::date),
    coalesce(
      v_bounds.last_snapshot_date,
      coalesce(p_through_date, (clock_timestamp() at time zone 'UTC')::date)
    )
  );
  return public.refresh_guild_zvz_season_snapshots_date_legacy(
    p_season_id,
    v_through_date,
    p_force
  );
end;
$$;

revoke all on function public.refresh_guild_zvz_season_snapshots(
  uuid, date, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_guild_zvz_season_snapshots(
  uuid, date, boolean
) to service_role;

alter function public.refresh_public_zvz_v2_season_snapshots(uuid, date, boolean)
  rename to refresh_public_zvz_v2_season_snapshots_date_legacy;
revoke all on function public.refresh_public_zvz_v2_season_snapshots_date_legacy(
  uuid, date, boolean
) from public, anon, authenticated, service_role;

create function public.refresh_public_zvz_v2_season_snapshots(
  p_season_id uuid,
  p_through_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounds record;
  v_through_date date;
begin
  select * into v_bounds
  from public.get_public_zvz_season_bounds(p_season_id);
  if not found then raise exception 'season not found'; end if;

  v_through_date := least(
    coalesce(p_through_date, (clock_timestamp() at time zone 'UTC')::date),
    coalesce(
      v_bounds.last_snapshot_date,
      coalesce(p_through_date, (clock_timestamp() at time zone 'UTC')::date)
    )
  );
  return public.refresh_public_zvz_v2_season_snapshots_date_legacy(
    p_season_id,
    v_through_date,
    p_force
  );
end;
$$;

revoke all on function public.refresh_public_zvz_v2_season_snapshots(
  uuid, date, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_public_zvz_v2_season_snapshots(
  uuid, date, boolean
) to service_role;

create or replace function public.refresh_all_guild_zvz_season_snapshots(
  p_albion_server text,
  p_force boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_results jsonb := '[]'::jsonb;
begin
  if p_albion_server is null
     or p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  for v_season in
    select season.id
    from public.zvz_seasons season
    where season.albion_server = p_albion_server
    order by coalesce(
      season.starts_at,
      season.starts_on::timestamp at time zone 'UTC'
    )
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_guild_zvz_season_snapshots(
        v_season.id,
        v_today,
        p_force
      )
    );
  end loop;
  return jsonb_build_object(
    'albion_server', p_albion_server,
    'seasons', v_results
  );
end;
$$;

create or replace function public.refresh_all_public_zvz_v2_season_snapshots(
  p_albion_server text,
  p_force boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_results jsonb := '[]'::jsonb;
begin
  if p_albion_server is null
     or p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'invalid Albion server';
  end if;
  for v_season in
    select season.id
    from public.zvz_seasons season
    where season.albion_server = p_albion_server
    order by coalesce(
      season.starts_at,
      season.starts_on::timestamp at time zone 'UTC'
    )
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_public_zvz_v2_season_snapshots(
        v_season.id,
        v_today,
        p_force
      )
    );
  end loop;
  return jsonb_build_object(
    'albion_server', p_albion_server,
    'seasons', v_results
  );
end;
$$;

revoke all on function public.refresh_all_guild_zvz_season_snapshots(
  text, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_all_guild_zvz_season_snapshots(
  text, boolean
) to service_role;
revoke all on function public.refresh_all_public_zvz_v2_season_snapshots(
  text, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_all_public_zvz_v2_season_snapshots(
  text, boolean
) to service_role;

create or replace function public.refresh_current_guild_zvz_season_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'UTC')::date;
  v_season record;
  v_results jsonb := '[]'::jsonb;
begin
  for v_season in
    select season.id
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
    where bounds.starts_at <= v_now
      and (bounds.ends_at is null or v_now < bounds.ends_at)
    order by season.albion_server
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_guild_zvz_season_snapshots(
        v_season.id,
        v_today,
        false
      )
    );
  end loop;
  return v_results;
end;
$$;

create or replace function public.refresh_current_public_zvz_v2_season_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'UTC')::date;
  v_season record;
  v_results jsonb := '[]'::jsonb;
begin
  for v_season in
    select season.id
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
    where bounds.starts_at <= v_now
      and (bounds.ends_at is null or v_now < bounds.ends_at)
    order by season.albion_server
  loop
    v_results := v_results || jsonb_build_array(
      public.refresh_public_zvz_v2_season_snapshots(
        v_season.id,
        v_today,
        false
      )
    );
  end loop;
  return v_results;
end;
$$;

revoke all on function public.refresh_current_guild_zvz_season_snapshots()
  from public, anon, authenticated;
grant execute on function public.refresh_current_guild_zvz_season_snapshots()
  to service_role;
revoke all on function public.refresh_current_public_zvz_v2_season_snapshots()
  from public, anon, authenticated;
grant execute on function public.refresh_current_public_zvz_v2_season_snapshots()
  to service_role;

create or replace function public.list_public_zvz_projection_backfill_candidates(
  p_limit integer default 25
)
returns table (
  battle_record_id uuid,
  albion_server text,
  raw_battle jsonb,
  engagement_source_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_seasons as (
    select distinct on (season.albion_server)
      season.albion_server,
      bounds.starts_at,
      bounds.ends_at
    from public.zvz_seasons season
    cross join lateral public.get_public_zvz_season_bounds(season.id) bounds
    where bounds.starts_at <= clock_timestamp()
      and (bounds.ends_at is null or clock_timestamp() < bounds.ends_at)
    order by season.albion_server, bounds.starts_at desc
  ),
  per_server as (
    select candidate.*
    from current_seasons season
    cross join lateral (
      select
        battle.id as battle_record_id,
        battle.albion_server,
        battle.raw_battle,
        battle.engagement_source_hash,
        battle.started_at
      from public.battle_records battle
      where battle.albion_server = season.albion_server
        and battle.started_at >= season.starts_at
        and (season.ends_at is null or battle.started_at < season.ends_at)
        and battle.total_players >= 40
        and not exists (
          select 1
          from public.public_zvz_battle_projection_runs run
          where run.battle_record_id = battle.id
            and run.source_hash is not distinct from battle.engagement_source_hash
            and run.coverage = 'complete'
        )
      order by battle.started_at desc, battle.id
      limit least(100, greatest(1, coalesce(p_limit, 25)))
    ) candidate
  )
  select
    candidate.battle_record_id,
    candidate.albion_server,
    candidate.raw_battle,
    candidate.engagement_source_hash
  from per_server candidate
  order by candidate.started_at desc, candidate.battle_record_id
  limit least(100, greatest(1, coalesce(p_limit, 25)));
$$;

revoke all on function public.list_public_zvz_projection_backfill_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_public_zvz_projection_backfill_candidates(integer)
  to service_role;
