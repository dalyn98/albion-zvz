-- Per-slot spell assignments. Stored as a single jsonb column on `slots`
-- with shape { weapon?: string[], head?: string[], armor?: string[],
-- shoes?: string[], offhand?: string[], potion?: string[], food?: string[],
-- cape?: string[] }. Each array holds Albion spell uniquenames.
--
-- One column instead of 8 parallel `{slot}_spells` columns because:
--   1. The shape is uniform across gear kinds (always string[])
--   2. Serialization/deserialization in templates + slots round-trips as
--      a single JSON value
--   3. Future extensions (e.g. per-weapon-option spells) can nest inside
--      the same jsonb without another schema migration
--
-- NULL means "no spells configured" — treated identically to `{}` at render
-- time but lets us distinguish legacy rows from explicitly-reset ones if
-- we ever need to.

alter table public.slots
  add column if not exists spells jsonb;
