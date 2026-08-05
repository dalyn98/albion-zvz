-- Alliance rankings represent an alliance's coordinated capability, so only
-- engagements with at least two directly observed guilds from that explicit
-- Albion alliance may create alliance ranking evidence.

create or replace function public.ignore_public_zvz_single_guild_alliance_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity_kind = 'alliance'
     and new.participation_kind <> 'joint_sortie' then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.ignore_public_zvz_single_guild_alliance_evidence()
  from public, anon, authenticated;

drop trigger if exists trg_ignore_public_zvz_single_guild_alliance_evidence
  on public.public_zvz_entity_engagement_evidence;

create trigger trg_ignore_public_zvz_single_guild_alliance_evidence
before insert on public.public_zvz_entity_engagement_evidence
for each row
execute function public.ignore_public_zvz_single_guild_alliance_evidence();

comment on function public.ignore_public_zvz_single_guild_alliance_evidence() is
  'Keeps stale projection writers compatible by dropping non-joint alliance evidence while preserving their guild evidence and canonical engagement.';

alter table public.public_zvz_entity_engagement_evidence
  add constraint public_zvz_alliance_evidence_requires_joint_sortie
  check (
    entity_kind <> 'alliance'
    or participation_kind = 'joint_sortie'
  ) not valid;

alter table public.public_zvz_v2_season_evidence
  add constraint public_zvz_season_alliance_evidence_requires_joint_sortie
  check (
    entity_kind <> 'alliance'
    or participation_kind = 'joint_sortie'
  ) not valid;

create or replace function public.validate_public_zvz_joint_alliance_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new_engagement_id uuid;
  v_old_engagement_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_engagement_id := new.engagement_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_engagement_id := old.engagement_id;
  end if;

  if exists (
    select 1
    from public.public_zvz_entity_engagement_evidence alliance_evidence
    where alliance_evidence.engagement_id = any(array_remove(
      array[v_new_engagement_id, v_old_engagement_id],
      null
    ))
      and alliance_evidence.entity_kind = 'alliance'
      and (
        alliance_evidence.participation_kind <> 'joint_sortie'
        or (
          select count(distinct guild_evidence.entity_albion_id)
          from public.public_zvz_entity_engagement_evidence guild_evidence
          where guild_evidence.engagement_id = alliance_evidence.engagement_id
            and guild_evidence.entity_kind = 'guild'
            and guild_evidence.alliance_albion_id =
              alliance_evidence.entity_albion_id
            and guild_evidence.participation_kind = 'joint_sortie'
        ) < 2
      )
  ) then
    raise exception
      'alliance ranking evidence requires at least two directly observed alliance guilds';
  end if;

  return null;
end;
$$;

revoke all on function public.validate_public_zvz_joint_alliance_evidence()
  from public, anon, authenticated;

drop trigger if exists trg_validate_public_zvz_joint_alliance_evidence
  on public.public_zvz_entity_engagement_evidence;

create constraint trigger trg_validate_public_zvz_joint_alliance_evidence
after insert or update or delete on public.public_zvz_entity_engagement_evidence
deferrable initially deferred
for each row
execute function public.validate_public_zvz_joint_alliance_evidence();

comment on function public.validate_public_zvz_joint_alliance_evidence() is
  'Defers alliance evidence validation until all proportional guild rows for the engagement have been written.';

comment on table public.public_zvz_entity_engagement_evidence is
  'Directly observed guild evidence plus one alliance row only for a joint sortie by at least two observed guilds. Guild credit is proportional and unobserved share is not reassigned.';

comment on table public.public_zvz_v2_season_evidence is
  'Frozen v2 season evidence. Alliance rows exist only for joint sorties by at least two directly observed guilds; single-guild sorties remain guild evidence only.';
