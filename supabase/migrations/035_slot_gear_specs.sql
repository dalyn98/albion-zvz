-- Per-slot target gear spec: tier (4-8) and enchant (0-4) that the member
-- should bring to the fight. Stored as a single jsonb column keyed by slot
-- kind (weapon/head/armor/shoes/offhand/potion/food/cape), with each entry
-- shaped { tier?: number, enchant?: number }. Either or both may be set.
--
-- This is separate from the item_id prefix (e.g. T8_MAIN_ARCANESTAFF) on
-- purpose — admin-picked item_id is a reference/archetype while gear_specs
-- is the quality requirement. Display layer shows "T8.3" to the member.
--
-- NULL or an empty object means "no spec" for every slot. Validation of
-- tier (4-8) and enchant (0-4) is enforced in application code to keep the
-- column flexible for future additions (e.g. quality level).
alter table public.slots
  add column if not exists gear_specs jsonb;
