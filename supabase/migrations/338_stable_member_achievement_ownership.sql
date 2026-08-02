-- 338: Release B makes permanent achievements belong to the stable guild-member
-- record while retaining the Discord subject as compatibility/evidence data.
-- Battle qualification and achievement definitions are deliberately unchanged.

alter table public.member_achievements
  add column if not exists guild_member_id uuid;

alter table public.member_achievements
  add constraint member_achievements_guild_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict
  not valid;

update public.member_achievements achievement
   set guild_member_id = public.resolve_guild_member_id(
     achievement.guild_id,
     public.guild_member_access_identity_type(achievement.discord_id),
     achievement.discord_id
   )
 where achievement.guild_member_id is null;

do $$
declare
  v_unresolved integer;
  v_mismatched integer;
  v_duplicate_groups integer;
begin
  select count(*)::integer
    into v_unresolved
    from public.member_achievements achievement
   where achievement.guild_member_id is null;

  if v_unresolved <> 0 then
    raise exception 'ACHIEVEMENT_OWNER_BACKFILL_INCOMPLETE:%', v_unresolved;
  end if;

  select count(*)::integer
    into v_mismatched
    from public.member_achievements achievement
   where achievement.guild_member_id is distinct from public.resolve_guild_member_id(
     achievement.guild_id,
     public.guild_member_access_identity_type(achievement.discord_id),
     achievement.discord_id
   );

  if v_mismatched <> 0 then
    raise exception 'ACHIEVEMENT_OWNER_BACKFILL_MISMATCH:%', v_mismatched;
  end if;

  select count(*)::integer
    into v_duplicate_groups
    from (
      select
        achievement.guild_id,
        achievement.guild_member_id,
        achievement.achievement_key,
        achievement.evidence_id
      from public.member_achievements achievement
      group by
        achievement.guild_id,
        achievement.guild_member_id,
        achievement.achievement_key,
        achievement.evidence_id
      having count(*) > 1
    ) duplicate_group;

  if v_duplicate_groups <> 0 then
    raise exception 'ACHIEVEMENT_STABLE_OWNER_DUPLICATE:%', v_duplicate_groups;
  end if;
end;
$$;

alter table public.member_achievements
  alter column guild_member_id set not null;

alter table public.member_achievements
  validate constraint member_achievements_guild_member_fkey;

create unique index if not exists member_achievements_stable_evidence_key
  on public.member_achievements (
    guild_id,
    guild_member_id,
    achievement_key,
    evidence_id
  );

create index if not exists member_achievements_stable_member_idx
  on public.member_achievements (
    guild_id,
    guild_member_id,
    earned_at desc,
    achievement_key
  );

create or replace function public.project_member_achievement_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_member_id uuid;
begin
  v_expected_member_id := public.resolve_guild_member_id(
    new.guild_id,
    public.guild_member_access_identity_type(new.discord_id),
    new.discord_id
  );

  if v_expected_member_id is null then
    raise exception 'ACHIEVEMENT_MEMBER_RECORD_REQUIRED';
  end if;

  if new.guild_member_id is null then
    new.guild_member_id := v_expected_member_id;
  elsif new.guild_member_id is distinct from v_expected_member_id then
    raise exception 'ACHIEVEMENT_MEMBER_RECORD_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.project_member_achievement_owner()
  from public, anon, authenticated, service_role;

drop trigger if exists project_member_achievement_owner
  on public.member_achievements;
create trigger project_member_achievement_owner
  before insert or update of guild_id, discord_id
  on public.member_achievements
  for each row execute function public.project_member_achievement_owner();

-- Merging access identities must not strand permanent history on a superseded
-- member UUID. Exact duplicate evidence is represented once; its earliest
-- acquisition timestamp is retained before the redundant physical row is
-- removed.
create or replace function public.reassign_member_achievements_after_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'merged'
     or new.merged_into_member_id is null
     or (
       old.status = 'merged'
       and old.merged_into_member_id is not distinct from new.merged_into_member_id
     ) then
    return new;
  end if;

  update public.member_achievements target
     set earned_at = least(target.earned_at, source.earned_at),
         recorded_at = least(target.recorded_at, source.recorded_at)
    from public.member_achievements source
   where source.guild_id = new.guild_id
     and source.guild_member_id = new.id
     and target.guild_id = new.guild_id
     and target.guild_member_id = new.merged_into_member_id
     and target.achievement_key = source.achievement_key
     and target.evidence_id = source.evidence_id;

  delete from public.member_achievements source
   using public.member_achievements target
   where source.guild_id = new.guild_id
     and source.guild_member_id = new.id
     and target.guild_id = new.guild_id
     and target.guild_member_id = new.merged_into_member_id
     and target.achievement_key = source.achievement_key
     and target.evidence_id = source.evidence_id;

  update public.member_achievements
     set guild_member_id = new.merged_into_member_id
   where guild_id = new.guild_id
     and guild_member_id = new.id;

  return new;
end;
$$;

revoke all on function public.reassign_member_achievements_after_merge()
  from public, anon, authenticated, service_role;

drop trigger if exists reassign_member_achievements_after_merge
  on public.guild_member_records;
create trigger reassign_member_achievements_after_merge
  after update of status, merged_into_member_id
  on public.guild_member_records
  for each row execute function public.reassign_member_achievements_after_merge();

comment on column public.member_achievements.guild_member_id is
  'Canonical stable guild-member owner. discord_id remains immutable compatibility evidence for the identity observed when the achievement was earned.';

notify pgrst, 'reload schema';
