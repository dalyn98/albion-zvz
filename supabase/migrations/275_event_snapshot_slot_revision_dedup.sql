-- Migration 274 added statement-level slot revision triggers in addition to
-- the existing per-slot parties.slots_version trigger from migration 262.
-- Inserts/deletes and layout updates therefore bumped an event twice. Keep
-- the existing party version as the layout signal and reserve this direct
-- slot trigger for live assignment/request fields that slots_version
-- intentionally ignores.
--
-- Forward rollback: restore migration 274's three slot triggers and its
-- bump_event_revision_from_slots() body in a new migration.

drop trigger if exists slots_event_revision_insert on public.slots;
drop trigger if exists slots_event_revision_delete on public.slots;

create or replace function public.bump_event_revision_from_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events e
     set state_revision = e.state_revision + 1
    from (
      select n.guild_id, p.event_id
      from new_rows n
      join old_rows o on o.id = n.id
      join public.parties p
        on p.guild_id = n.guild_id
       and p.id = n.party_id
      where (
        n.assigned_discord_id,
        n.assigned_username,
        n.assigned_weapon_name,
        n.assigned_weapon_id,
        n.assigned_head_name,
        n.assigned_head_id,
        n.assigned_armor_name,
        n.assigned_armor_id,
        n.assigned_shoes_name,
        n.assigned_shoes_id,
        n.assigned_offhand_name,
        n.assigned_offhand_id,
        n.assigned_potion_name,
        n.assigned_potion_id,
        n.assigned_food_name,
        n.assigned_food_id,
        n.assigned_cape_name,
        n.assigned_cape_id,
        n.assigned_mount_name,
        n.assigned_mount_id,
        n.requested_discord_id,
        n.requested_username,
        n.requested_picks,
        n.requested_at
      ) is distinct from (
        o.assigned_discord_id,
        o.assigned_username,
        o.assigned_weapon_name,
        o.assigned_weapon_id,
        o.assigned_head_name,
        o.assigned_head_id,
        o.assigned_armor_name,
        o.assigned_armor_id,
        o.assigned_shoes_name,
        o.assigned_shoes_id,
        o.assigned_offhand_name,
        o.assigned_offhand_id,
        o.assigned_potion_name,
        o.assigned_potion_id,
        o.assigned_food_name,
        o.assigned_food_id,
        o.assigned_cape_name,
        o.assigned_cape_id,
        o.assigned_mount_name,
        o.assigned_mount_id,
        o.requested_discord_id,
        o.requested_username,
        o.requested_picks,
        o.requested_at
      )

      union

      select o.guild_id, p.event_id
      from old_rows o
      join new_rows n on n.id = o.id
      join public.parties p
        on p.guild_id = o.guild_id
       and p.id = o.party_id
      where (
        n.assigned_discord_id,
        n.assigned_username,
        n.assigned_weapon_name,
        n.assigned_weapon_id,
        n.assigned_head_name,
        n.assigned_head_id,
        n.assigned_armor_name,
        n.assigned_armor_id,
        n.assigned_shoes_name,
        n.assigned_shoes_id,
        n.assigned_offhand_name,
        n.assigned_offhand_id,
        n.assigned_potion_name,
        n.assigned_potion_id,
        n.assigned_food_name,
        n.assigned_food_id,
        n.assigned_cape_name,
        n.assigned_cape_id,
        n.assigned_mount_name,
        n.assigned_mount_id,
        n.requested_discord_id,
        n.requested_username,
        n.requested_picks,
        n.requested_at
      ) is distinct from (
        o.assigned_discord_id,
        o.assigned_username,
        o.assigned_weapon_name,
        o.assigned_weapon_id,
        o.assigned_head_name,
        o.assigned_head_id,
        o.assigned_armor_name,
        o.assigned_armor_id,
        o.assigned_shoes_name,
        o.assigned_shoes_id,
        o.assigned_offhand_name,
        o.assigned_offhand_id,
        o.assigned_potion_name,
        o.assigned_potion_id,
        o.assigned_food_name,
        o.assigned_food_id,
        o.assigned_cape_name,
        o.assigned_cape_id,
        o.assigned_mount_name,
        o.assigned_mount_id,
        o.requested_discord_id,
        o.requested_username,
        o.requested_picks,
        o.requested_at
      )
    ) changed
   where e.guild_id = changed.guild_id
     and e.id = changed.event_id;
  return null;
end;
$$;

drop trigger if exists slots_event_revision_update on public.slots;
create trigger slots_event_revision_update
after update on public.slots
referencing old table as old_rows new table as new_rows
for each statement execute function public.bump_event_revision_from_slots();

revoke all on function public.bump_event_revision_from_slots() from public, anon, authenticated;

notify pgrst, 'reload schema';
