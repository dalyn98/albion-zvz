-- 006_event_gather_at.sql
--
-- Adds a real timestamp for the gather time so we can sort by "imminence"
-- and stop parsing free-text. The existing `gather_time` column stays as
-- the human display string ("4월 29일 16시 30분") and is derived on write.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS gather_at TIMESTAMPTZ;
