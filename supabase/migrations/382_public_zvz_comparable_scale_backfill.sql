-- Normalize existing projections and frozen evidence, then rebuild only the
-- affected scale-specific rollups. Overall rollups and raw records are kept.

update public.public_zvz_engagements engagement
   set scale = case
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 20 then 'small'
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 40 then 'mid'
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 80 then 'large'
         else 'zerg'
       end,
       qualification_version = 'agm_zvz_v2_comp75'
 where engagement.scale is distinct from case
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 20 then 'small'
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 40 then 'mid'
         when greatest(
           engagement.home_side_team_size,
           engagement.opponent_side_team_size
         ) <= 80 then 'large'
         else 'zerg'
       end
    or engagement.qualification_version is distinct from 'agm_zvz_v2_comp75';

update public.public_zvz_v2_season_evidence evidence
   set scale = case
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 20 then 'small'
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 40 then 'mid'
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 80 then 'large'
         else 'zerg'
       end,
       qualification_version = 'agm_zvz_v2_comp75',
       frozen_at = clock_timestamp()
 where evidence.scale is distinct from case
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 20 then 'small'
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 40 then 'mid'
         when greatest(
           evidence.side_team_size,
           evidence.opponent_side_team_size
         ) <= 80 then 'large'
         else 'zerg'
       end
    or evidence.qualification_version is distinct from 'agm_zvz_v2_comp75';

do $$
declare
  v_batch record;
begin
  for v_batch in
    select
      snapshot.season_id,
      array_agg(snapshot.snapshot_date order by snapshot.snapshot_date)
        as snapshot_dates
    from public.public_zvz_v2_season_snapshots snapshot
    group by snapshot.season_id
  loop
    perform public.rebuild_public_zvz_v2_comparable_scale_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
end;
$$;
