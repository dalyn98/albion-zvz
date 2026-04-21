-- BM (battle mount) role has historically stored its battle mount in the
-- weapon column because the weapon ItemPicker accepted the "mount" category.
-- Migration 036 gave mount its own first-class columns; this migration moves
-- the existing data into the new home so UI code can stop caring about the
-- legacy shape. Weapon columns are nulled because BM's only gear is the mount.
--
-- Assumptions:
--  * All BM slots have their mount data exclusively in weapon_* (nothing in
--    mount_* yet). Sanity check asserted below to refuse running if the state
--    is unexpected.
--  * Non-BM slots keep their weapon data as-is. This migration does not
--    attempt to detect battle mounts stored in non-BM weapon columns — those
--    are admin errors and should be fixed by editing the slot.

do $$
declare
  v_conflicts int;
begin
  select count(*) into v_conflicts
    from public.slots
   where role_name = 'BM'
     and (
       mount_name is not null
       or mount_id is not null
       or mount_options is not null
       or assigned_mount_name is not null
       or assigned_mount_id is not null
     );
  if v_conflicts > 0 then
    raise exception 'BM_MIGRATION_CONFLICT: % BM slots already have mount data populated', v_conflicts;
  end if;
end
$$;

update public.slots
   set mount_name          = weapon_name,
       mount_id            = weapon_id,
       mount_options       = weapon_options,
       assigned_mount_name = assigned_weapon_name,
       assigned_mount_id   = assigned_weapon_id,
       weapon_name          = null,
       weapon_id            = null,
       weapon_options       = null,
       assigned_weapon_name = null,
       assigned_weapon_id   = null
 where role_name = 'BM'
   and (
     weapon_name is not null
     or weapon_id is not null
     or weapon_options is not null
     or assigned_weapon_name is not null
     or assigned_weapon_id is not null
   );
