-- 399: Remove the empty auto-generated boundary that conflicts with the
-- operator-confirmed Season 33 end, and expose an atomic one-day v2 rebuild.

delete from public.zvz_seasons season
where season.name = 'Season 2026-08-31'
  and season.starts_on = date '2026-08-31'
  and season.starts_at = timestamptz '2026-08-31 00:00:00+00'
  and season.created_by_discord_id is null
  and season.albion_server in ('east', 'west', 'europe')
  and not exists (
    select 1
    from public.zvz_season_snapshots snapshot
    where snapshot.season_id = season.id
  )
  and not exists (
    select 1
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = season.id
  );

do $$
begin
  if exists (
    select 1
    from public.zvz_seasons season
    where season.name = 'Season 2026-08-31'
      and season.starts_on = date '2026-08-31'
      and season.albion_server in ('east', 'west', 'europe')
  ) then
    raise exception 'conflicting Season 2026-08-31 boundary contains data or was not auto-generated';
  end if;
end;
$$;

create or replace function public.refresh_public_zvz_v2_season_snapshot_day(
  p_season_id uuid,
  p_snapshot_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounds record;
  v_result jsonb;
begin
  select * into v_bounds
  from public.get_public_zvz_season_bounds(p_season_id);

  if not found then
    raise exception 'season not found';
  end if;
  if p_snapshot_date < (v_bounds.starts_at at time zone 'UTC')::date
     or p_snapshot_date > v_bounds.last_snapshot_date then
    raise exception 'snapshot date is outside the exact season bounds';
  end if;

  delete from public.public_zvz_v2_season_snapshots snapshot
  where snapshot.season_id = p_season_id
    and snapshot.snapshot_date = p_snapshot_date;

  v_result := public.refresh_public_zvz_v2_season_snapshots(
    p_season_id,
    p_snapshot_date,
    false
  );

  if not exists (
    select 1
    from public.public_zvz_v2_season_snapshots snapshot
    where snapshot.season_id = p_season_id
      and snapshot.snapshot_date = p_snapshot_date
  ) then
    raise exception 'target snapshot was not rebuilt';
  end if;

  return v_result;
end;
$$;

revoke all on function public.refresh_public_zvz_v2_season_snapshot_day(uuid, date)
  from public, anon, authenticated;
grant execute on function public.refresh_public_zvz_v2_season_snapshot_day(uuid, date)
  to service_role;

comment on function public.refresh_public_zvz_v2_season_snapshot_day(uuid, date) is
  'Atomically rebuilds one exact-bound v2 season snapshot so long seasons can be refreshed without one oversized transaction.';
