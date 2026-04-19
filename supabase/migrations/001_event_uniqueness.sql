-- One slot per event per user (was: one slot per party per user).
-- Incremental migration — preserves existing data.
--
-- Run in Supabase SQL Editor. If an existing user already holds multiple
-- slots in the same event before this migration runs, the conflicting rows
-- keep their data but will violate the new invariant; clean those up
-- beforehand if needed. (Cleanup query at bottom of this file, commented.)

-- 1) Drop the party-scoped unique index — superseded by the event-level check.
DROP INDEX IF EXISTS slots_one_per_party_per_user;

-- 2) Replace assign_slot RPC with event-scoped guard.
--
-- Race note: we can't rely on a unique index because slots have party_id,
-- not event_id. Instead we take a pg_advisory_xact_lock keyed on
-- (event_id, discord_id) so two concurrent assign_slot calls for the same
-- user in the same event serialize, making the EXISTS check race-free.
CREATE OR REPLACE FUNCTION assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_party_id uuid;
  v_event_id uuid;
  v_existing text;
BEGIN
  SELECT s.party_id, p.event_id, s.assigned_discord_id
    INTO v_party_id, v_event_id, v_existing
    FROM slots s
    JOIN parties p ON p.id = s.party_id
   WHERE s.id = p_slot_id
     FOR UPDATE OF s;

  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  IF EXISTS (
    SELECT 1
      FROM slots s
      JOIN parties p ON p.id = s.party_id
     WHERE p.event_id = v_event_id
       AND s.assigned_discord_id = p_discord_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_IN_EVENT';
  END IF;

  UPDATE slots
     SET assigned_discord_id = p_discord_id,
         assigned_username   = p_username
   WHERE id = p_slot_id;
END;
$$;

-- Cleanup helper (commented). Uncomment and run BEFORE the migration above
-- if the new constraint would be violated by current data. Keeps the
-- lowest-slot-id assignment per (event, user) and clears the rest.
--
-- WITH ranked AS (
--   SELECT s.id,
--          row_number() OVER (
--            PARTITION BY p.event_id, s.assigned_discord_id
--            ORDER BY s.id
--          ) AS rn
--     FROM slots s
--     JOIN parties p ON p.id = s.party_id
--    WHERE s.assigned_discord_id IS NOT NULL
-- )
-- UPDATE slots
--    SET assigned_discord_id = NULL, assigned_username = NULL
--  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
