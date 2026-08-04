-- Keep v1 and v2 season snapshots aligned whenever an operator changes a
-- season boundary. The trigger also protects direct service-role writes that
-- bypass save_public_zvz_season().

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
     and old.starts_on is not distinct from new.starts_on then
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

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_public_zvz_season_snapshots()
  from public, anon, authenticated;

drop trigger if exists trg_invalidate_public_zvz_season_snapshots
  on public.zvz_seasons;

create trigger trg_invalidate_public_zvz_season_snapshots
after insert or update or delete on public.zvz_seasons
for each row execute function public.invalidate_public_zvz_season_snapshots();

comment on function public.invalidate_public_zvz_season_snapshots() is
  'Invalidates both AGM Battles snapshot generations when a server season boundary changes.';

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
    order by season.starts_on
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

revoke all on function public.refresh_all_public_zvz_v2_season_snapshots(text, boolean)
  from public, anon, authenticated;
grant execute on function public.refresh_all_public_zvz_v2_season_snapshots(text, boolean)
  to service_role;

comment on function public.refresh_all_public_zvz_v2_season_snapshots(text, boolean) is
  'Rebuilds every v2 season snapshot for one Albion server after a boundary edit or explicit operator request.';
