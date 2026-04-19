-- 004_battle_start.sql
--
-- Replaces the free-text `gather_time` as the regear window anchor.
-- Admin clicks "전투 시작" at battle kickoff, which records a real
-- timestamp we can use to validate killboard deaths. `gather_time`
-- stays for display/planning purposes.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS battle_started_at TIMESTAMPTZ NULL;
