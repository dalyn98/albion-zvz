-- Remove legacy single-guild alliance score evidence without deleting the
-- canonical engagement or any guild evidence. Rebuild only seasons whose
-- frozen evidence and downstream rollups were affected.

delete from public.public_zvz_entity_engagement_evidence alliance_evidence
where alliance_evidence.entity_kind = 'alliance'
  and (
    alliance_evidence.participation_kind <> 'joint_sortie'
    or (
      select count(distinct guild_evidence.entity_albion_id)
      from public.public_zvz_entity_engagement_evidence guild_evidence
      where guild_evidence.engagement_id = alliance_evidence.engagement_id
        and guild_evidence.entity_kind = 'guild'
        and guild_evidence.alliance_albion_id = alliance_evidence.entity_albion_id
        and guild_evidence.participation_kind = 'joint_sortie'
    ) < 2
  );

do $$
declare
  v_season record;
begin
  for v_season in
    select
      invalid.season_id,
      max(snapshot.snapshot_date) as through_date
    from (
      select distinct alliance_evidence.season_id
      from public.public_zvz_v2_season_evidence alliance_evidence
      where alliance_evidence.entity_kind = 'alliance'
        and (
          alliance_evidence.participation_kind <> 'joint_sortie'
          or (
            select count(distinct guild_evidence.entity_albion_id)
            from public.public_zvz_v2_season_evidence guild_evidence
            where guild_evidence.season_id = alliance_evidence.season_id
              and guild_evidence.engagement_id = alliance_evidence.engagement_id
              and guild_evidence.entity_kind = 'guild'
              and guild_evidence.alliance_albion_id =
                alliance_evidence.entity_albion_id
              and guild_evidence.participation_kind = 'joint_sortie'
          ) < 2
        )
    ) invalid
    join public.public_zvz_v2_season_snapshots snapshot
      on snapshot.season_id = invalid.season_id
    group by invalid.season_id
  loop
    perform public.refresh_public_zvz_v2_season_snapshots(
      v_season.season_id,
      v_season.through_date,
      true
    );
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.public_zvz_entity_engagement_evidence alliance_evidence
    where alliance_evidence.entity_kind = 'alliance'
      and (
        select count(distinct guild_evidence.entity_albion_id)
        from public.public_zvz_entity_engagement_evidence guild_evidence
        where guild_evidence.engagement_id = alliance_evidence.engagement_id
          and guild_evidence.entity_kind = 'guild'
          and guild_evidence.alliance_albion_id =
            alliance_evidence.entity_albion_id
          and guild_evidence.participation_kind = 'joint_sortie'
      ) < 2
  ) then
    raise exception 'legacy alliance evidence remains without two observed guilds';
  end if;

  if exists (
    select 1
    from public.public_zvz_v2_season_evidence alliance_evidence
    where alliance_evidence.entity_kind = 'alliance'
      and (
        select count(distinct guild_evidence.entity_albion_id)
        from public.public_zvz_v2_season_evidence guild_evidence
        where guild_evidence.season_id = alliance_evidence.season_id
          and guild_evidence.engagement_id = alliance_evidence.engagement_id
          and guild_evidence.entity_kind = 'guild'
          and guild_evidence.alliance_albion_id =
            alliance_evidence.entity_albion_id
          and guild_evidence.participation_kind = 'joint_sortie'
      ) < 2
  ) then
    raise exception 'legacy frozen alliance evidence remains without two observed guilds';
  end if;
end;
$$;
