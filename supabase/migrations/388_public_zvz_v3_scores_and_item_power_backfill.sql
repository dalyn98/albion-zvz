-- Backfill battle-level observed IP samples, copy them into every frozen day,
-- then rebuild all published snapshots with the v3 formula.

with player_ip as (
  select
    engagement.id as engagement_id,
    evidence.entity_kind,
    evidence.entity_albion_id,
    round(avg(
      case
        when ip.value ~ '^[0-9]+([.][0-9]+)?$'
          then ip.value::numeric
        else null
      end
    ), 2) as average_item_power,
    count(*)::integer as item_power_sample_count
  from public.public_zvz_entity_engagement_evidence evidence
  join public.public_zvz_engagements engagement
    on engagement.id = evidence.engagement_id
  join public.battle_records battle
    on battle.id = engagement.battle_record_id
  cross join lateral jsonb_each(
    coalesce(battle.raw_battle->'players', '{}'::jsonb)
  ) player
  cross join lateral (
    values (coalesce(
      nullif(player.value->>'averageItemPower', ''),
      nullif(player.value->>'AverageItemPower', ''),
      nullif(player.value->>'itemPower', '')
    ))
  ) ip(value)
  where (
    (
      evidence.entity_kind = 'guild'
      and player.value->>'guildId' = evidence.entity_albion_id
    )
    or (
      evidence.entity_kind = 'alliance'
      and nullif(player.value->>'allianceId', '') = evidence.entity_albion_id
    )
  )
  and ip.value ~ '^[0-9]+([.][0-9]+)?$'
  and case
    when ip.value ~ '^[0-9]+([.][0-9]+)?$' then ip.value::numeric > 0
    else false
  end
  group by
    engagement.id,
    evidence.entity_kind,
    evidence.entity_albion_id
)
update public.public_zvz_entity_engagement_evidence evidence
   set average_item_power = player_ip.average_item_power,
       item_power_sample_count = player_ip.item_power_sample_count
  from player_ip
 where evidence.engagement_id = player_ip.engagement_id
   and evidence.entity_kind = player_ip.entity_kind
   and evidence.entity_albion_id = player_ip.entity_albion_id;

update public.public_zvz_v2_season_evidence frozen
   set average_item_power = source.average_item_power,
       item_power_sample_count = source.item_power_sample_count,
       frozen_at = clock_timestamp()
  from public.public_zvz_entity_engagement_evidence source
 where frozen.engagement_id = source.engagement_id
   and frozen.entity_kind = source.entity_kind
   and frozen.entity_albion_id = source.entity_albion_id;

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
    perform public.rebuild_public_zvz_v3_rollups(
      v_batch.season_id,
      v_batch.snapshot_dates
    );
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where rollup.score_formula_version <> 'agm_zvz_v3'
  ) then
    raise exception 'legacy public ZvZ score rows remain after v3 rebuild';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where abs(
      rollup.score - (
        rollup.size_points
          + rollup.combat_points
          + rollup.efficiency_points
          + rollup.activity_points
      )
    ) > 0.02
  ) then
    raise exception 'public ZvZ v3 component sum does not match score';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_rollups rollup
    where (
      rollup.scope = 'overall'
      and (
        rollup.size_points > 350
        or rollup.combat_points > 350
        or rollup.efficiency_points > 150
        or rollup.activity_points > 150
      )
    ) or (
      rollup.scope <> 'overall'
      and (
        rollup.size_points <> 0
        or rollup.efficiency_points <> 0
        or rollup.combat_points > 700
        or rollup.activity_points > 300
      )
    )
  ) then
    raise exception 'public ZvZ v3 component bounds are invalid';
  end if;
end;
$$;
