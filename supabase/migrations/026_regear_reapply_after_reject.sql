-- Allow re-applying for regear after a rejection.
--
-- Previously (event_id, discord_id) was globally unique, which blocked a user
-- from ever resubmitting even if the admin rejected for a fixable reason
-- (wrong screenshot, wrong amount, etc.). Switch to a partial unique index
-- that only enforces uniqueness over non-rejected rows, so rejected requests
-- stay on record but don't block a fresh attempt.

ALTER TABLE regear_requests
  DROP CONSTRAINT IF EXISTS regear_requests_event_id_discord_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS regear_requests_active_unique
  ON regear_requests (event_id, discord_id)
  WHERE status <> 'rejected';
