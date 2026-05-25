-- Clear stale member gear picks left behind by admin-side slot assignment
-- clears that removed assigned_discord_id but did not clear assigned_* gear.
-- Forward-only data cleanup; safe to rerun.

update public.slots
set
  assigned_username = null,
  assigned_weapon_name = null,
  assigned_weapon_id = null,
  assigned_head_name = null,
  assigned_head_id = null,
  assigned_armor_name = null,
  assigned_armor_id = null,
  assigned_shoes_name = null,
  assigned_shoes_id = null,
  assigned_offhand_name = null,
  assigned_offhand_id = null,
  assigned_potion_name = null,
  assigned_potion_id = null,
  assigned_food_name = null,
  assigned_food_id = null,
  assigned_cape_name = null,
  assigned_cape_id = null,
  assigned_mount_name = null,
  assigned_mount_id = null
where assigned_discord_id is null
  and (
    assigned_username is not null
    or assigned_weapon_name is not null
    or assigned_weapon_id is not null
    or assigned_head_name is not null
    or assigned_head_id is not null
    or assigned_armor_name is not null
    or assigned_armor_id is not null
    or assigned_shoes_name is not null
    or assigned_shoes_id is not null
    or assigned_offhand_name is not null
    or assigned_offhand_id is not null
    or assigned_potion_name is not null
    or assigned_potion_id is not null
    or assigned_food_name is not null
    or assigned_food_id is not null
    or assigned_cape_name is not null
    or assigned_cape_id is not null
    or assigned_mount_name is not null
    or assigned_mount_id is not null
  );
