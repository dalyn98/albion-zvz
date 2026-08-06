-- A season may end before UTC midnight. Cap the final daily snapshot's
-- publication instant to that exact boundary after the audited date rebuild.

create or replace function public.refresh_guild_zvz_season_snapshots(
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
  v_result jsonb;
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
  v_result := public.refresh_guild_zvz_season_snapshots_date_legacy(
    p_season_id,
    v_through_date,
    p_force
  );

  if v_bounds.ends_at is not null then
    update public.zvz_season_snapshots snapshot
       set data_through_at = least(snapshot.data_through_at, v_bounds.ends_at),
           is_final = least(snapshot.data_through_at, v_bounds.ends_at)
             <= clock_timestamp() - interval '48 hours'
     where snapshot.season_id = p_season_id
       and snapshot.snapshot_date = v_bounds.last_snapshot_date;
  end if;
  return v_result;
end;
$$;

create or replace function public.refresh_public_zvz_v2_season_snapshots(
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
  v_result jsonb;
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
  v_result := public.refresh_public_zvz_v2_season_snapshots_date_legacy(
    p_season_id,
    v_through_date,
    p_force
  );

  if v_bounds.ends_at is not null then
    update public.public_zvz_v2_season_snapshots snapshot
       set data_through_at = least(snapshot.data_through_at, v_bounds.ends_at),
           is_final = least(snapshot.data_through_at, v_bounds.ends_at)
             <= clock_timestamp() - interval '48 hours'
     where snapshot.season_id = p_season_id
       and snapshot.snapshot_date = v_bounds.last_snapshot_date;
  end if;
  return v_result;
end;
$$;

revoke all on function public.refresh_guild_zvz_season_snapshots(
  uuid, date, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_guild_zvz_season_snapshots(
  uuid, date, boolean
) to service_role;
revoke all on function public.refresh_public_zvz_v2_season_snapshots(
  uuid, date, boolean
) from public, anon, authenticated;
grant execute on function public.refresh_public_zvz_v2_season_snapshots(
  uuid, date, boolean
) to service_role;
