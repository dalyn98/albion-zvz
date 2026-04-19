-- 005_preserve_regear_history.sql
--
-- Keep regear records intact even after their parent event is deleted.
-- The original FK used ON DELETE CASCADE, which meant removing an event
-- also removed every historical regear tied to it — unacceptable for
-- the silver/points audit trail.
--
-- Changes:
--   1. Snapshot the event title onto each regear row (so history is
--      readable even if the event is later removed).
--   2. Make `event_id` nullable and re-link with ON DELETE SET NULL so
--      rows survive, but still point to the event while it exists.

ALTER TABLE regear_requests
  ADD COLUMN IF NOT EXISTS event_title_snapshot text;

UPDATE regear_requests r
   SET event_title_snapshot = e.title
  FROM events e
 WHERE r.event_id = e.id
   AND r.event_title_snapshot IS NULL;

ALTER TABLE regear_requests
  DROP CONSTRAINT IF EXISTS regear_requests_event_id_fkey;

ALTER TABLE regear_requests
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE regear_requests
  ADD CONSTRAINT regear_requests_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
