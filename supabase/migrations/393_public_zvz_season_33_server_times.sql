-- Season 33 official server schedule supplied by the operator.
-- ends_at is exclusive, so 2026-09-01 00:00 UTC includes all of August 31.

update public.zvz_seasons
set
  starts_on = date '2026-07-04',
  starts_at = case albion_server
    when 'east' then timestamptz '2026-07-04 00:00:00+00'
    when 'west' then timestamptz '2026-07-04 11:00:00+00'
    when 'europe' then timestamptz '2026-07-04 11:00:00+00'
  end,
  ends_at = timestamptz '2026-09-01 00:00:00+00',
  updated_at = clock_timestamp()
where name = 'Season 33'
  and albion_server in ('east', 'west', 'europe');

insert into public.zvz_seasons (
  albion_server,
  name,
  starts_on,
  starts_at,
  ends_at
)
values
  (
    'east',
    'Season 33',
    date '2026-07-04',
    timestamptz '2026-07-04 00:00:00+00',
    timestamptz '2026-09-01 00:00:00+00'
  ),
  (
    'west',
    'Season 33',
    date '2026-07-04',
    timestamptz '2026-07-04 11:00:00+00',
    timestamptz '2026-09-01 00:00:00+00'
  ),
  (
    'europe',
    'Season 33',
    date '2026-07-04',
    timestamptz '2026-07-04 11:00:00+00',
    timestamptz '2026-09-01 00:00:00+00'
  )
on conflict (albion_server, starts_on) do update
set
  name = excluded.name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  updated_at = clock_timestamp();

do $$
declare
  v_matching integer;
begin
  select count(*) into v_matching
  from public.zvz_seasons season
  where season.name = 'Season 33'
    and season.starts_on = date '2026-07-04'
    and season.ends_at = timestamptz '2026-09-01 00:00:00+00'
    and season.starts_at = case season.albion_server
      when 'east' then timestamptz '2026-07-04 00:00:00+00'
      when 'west' then timestamptz '2026-07-04 11:00:00+00'
      when 'europe' then timestamptz '2026-07-04 11:00:00+00'
    end;

  if v_matching <> 3 then
    raise exception 'Season 33 server boundary validation failed: % rows', v_matching;
  end if;
end;
$$;

select public.refresh_all_guild_zvz_season_snapshots('east', true);
select public.refresh_all_guild_zvz_season_snapshots('west', true);
select public.refresh_all_guild_zvz_season_snapshots('europe', true);
select public.refresh_all_public_zvz_v2_season_snapshots('east', true);
select public.refresh_all_public_zvz_v2_season_snapshots('west', true);
select public.refresh_all_public_zvz_v2_season_snapshots('europe', true);
