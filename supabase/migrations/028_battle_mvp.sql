-- Track per-battle MVP (Most Valuable Player).
--
-- `mvp_discord_id` stores the Discord ID of the member chosen by the admin
-- as MVP of a given battle. NULL means "no MVP recorded" (default) — legacy
-- battles and battles without a standout performer both use NULL.
--
-- We intentionally do NOT add an FK to any member/user table:
--   • Members can leave the guild while their MVP record should persist as
--     historical data (same rationale as opponent_guild text snapshots).
--   • The Discord ID is the canonical identity across the app (slots,
--     regear_requests, guild_members all key on it).
--
-- The application layer validates that the provided discord_id matches an
-- attending/assigned member of that event before writing — SQL doesn't need
-- to enforce this because the constraint is event-scoped, not DB-wide.
ALTER TABLE event_battles ADD COLUMN IF NOT EXISTS mvp_discord_id text;

-- Partial index — MVP lookups are always "who was MVP in which battles",
-- never "which battles have no MVP". Partial keeps the index lean.
CREATE INDEX IF NOT EXISTS event_battles_mvp_discord_id_idx
  ON event_battles (mvp_discord_id)
  WHERE mvp_discord_id IS NOT NULL;
