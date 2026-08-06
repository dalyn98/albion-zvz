-- Rebuild derived ranking snapshots after migration 404 changes alliance
-- attribution. Canonical engagements and battle-time evidence are untouched.

-- The three server rebuilds are individually bounded by the refresh functions,
-- but their combined runtime can exceed the connection's three-minute default.
set statement_timeout = '15min';

do $$
declare
  season_row record;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  for season_row in
    select distinct season.id
    from public.zvz_seasons season
    join public.public_zvz_v2_season_snapshots snapshot
      on snapshot.season_id = season.id
    order by season.id
  loop
    perform public.refresh_public_zvz_v2_season_snapshots(
      season_row.id,
      v_today,
      true
    );
  end loop;
end;
$$;

reset statement_timeout;
