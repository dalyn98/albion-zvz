-- Backfill evidence and persisted score components for every weekly rollup
-- already retained by AGM Battles. Keep data work separate from migration 319's
-- schema/function expansion.

do $$
declare
  v_week_start date;
  v_week_starts date[];
begin
  select array_agg(distinct week_start order by week_start)
    into v_week_starts
    from public.guild_weekly_zvz_rollups;

  if v_week_starts is null then
    return;
  end if;

  foreach v_week_start in array v_week_starts
  loop
    perform public.refresh_guild_weekly_zvz_rollups(v_week_start);
  end loop;
end;
$$;
