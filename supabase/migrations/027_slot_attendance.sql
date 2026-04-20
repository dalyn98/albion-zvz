-- Track who actually showed up to a battle, not just who signed up.
--
-- `attended_at` is the server time when the admin confirmed the member was
-- present in-game. NULL means "not confirmed" (default) — this lets existing
-- events before this migration keep working as "attendance unknown".
--
-- A member counts as "no-show" when their slot has assigned_discord_id
-- IS NOT NULL AND attended_at IS NULL AND the event's battle_started_at
-- has passed. The stats layer aggregates these distinctions separately from
-- the pure sign-up count.
--
-- Attendance is independent of the per-slot regear flow (regear_requests
-- stays untouched) — a member can attend without claiming regear, and an
-- attending member can still be rejected for regear based on screenshot
-- evidence. We store the timestamp rather than a boolean so future audit
-- tooling can see exactly when the admin checked them in.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS attended_at timestamptz;

-- Partial index — only confirmed attendances are ever queried by the stats
-- aggregation ("who attended which events"). Keeping it partial keeps the
-- index small for the large population of NULL rows.
CREATE INDEX IF NOT EXISTS slots_attended_at_idx
  ON slots (attended_at)
  WHERE attended_at IS NOT NULL;
