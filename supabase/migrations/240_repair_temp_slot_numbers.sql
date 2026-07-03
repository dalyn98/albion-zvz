-- Repair slot rows left in the temporary renumbering range.
--
-- Migration 022 intentionally allowed slot_number 1001..1040 so the app could
-- park slots while resolving UNIQUE(party_id, slot_number) during reorders.
-- A later app bug could leave unchanged-position slots parked there. This
-- forward-only data repair compacts every affected party back to 1..N using the
-- visible order implied by temp numbers (1003 -> 3, etc.).
--
-- Rollback plan: restore from the pre-migration backup created by
-- scripts/safe-db-push.sh. Re-running this migration is a no-op when no temp
-- slot numbers remain.

create temporary table agm_temp_slot_number_repair on commit drop as
with affected_parties as (
  select distinct party_id
    from public.slots
   where slot_number between 1001 and 1040
),
ranked_slots as (
  select
    s.id,
    s.party_id,
    row_number() over (
      partition by s.party_id
      order by
        case
          when s.slot_number between 1001 and 1040 then s.slot_number - 1000
          else s.slot_number
        end,
        s.id
    ) as final_slot_number
  from public.slots s
  join affected_parties ap on ap.party_id = s.party_id
),
free_parking_numbers as (
  select
    ap.party_id,
    number as parking_slot_number,
    row_number() over (partition by ap.party_id order by number) as parking_ordinal
  from affected_parties ap
  cross join generate_series(1001, 1040) as number
  where not exists (
    select 1
      from public.slots existing
     where existing.party_id = ap.party_id
       and existing.slot_number = number
  )
)
select
  ranked_slots.id,
  ranked_slots.party_id,
  ranked_slots.final_slot_number,
  free_parking_numbers.parking_slot_number
from ranked_slots
join free_parking_numbers
  on free_parking_numbers.party_id = ranked_slots.party_id
 and free_parking_numbers.parking_ordinal = ranked_slots.final_slot_number;

-- First put every row in the affected parties into a unique temp slot that was
-- free before the migration started. That avoids collisions with the existing
-- UNIQUE(party_id, slot_number) constraint even though the constraint is not
-- deferrable.
update public.slots s
   set slot_number = r.parking_slot_number
  from agm_temp_slot_number_repair r
 where s.id = r.id
   and s.slot_number <> r.parking_slot_number;

update public.slots s
   set slot_number = r.final_slot_number
  from agm_temp_slot_number_repair r
 where s.id = r.id
   and s.slot_number <> r.final_slot_number;
