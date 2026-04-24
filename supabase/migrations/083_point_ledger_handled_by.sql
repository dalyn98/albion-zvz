-- Track which admin performed each manual point_ledger adjustment
-- (reason = 'admin_adjust'). Parallel to migration 040, which added the same
-- columns to regear/exchange/donation request tables. Without this, the
-- member detail's "수동 조정" row has no accountability trail.
--
-- ID is stable; snapshotted username keeps the display readable even if the
-- admin's Discord name later changes or they leave the guild. Legacy rows
-- stay null and render as "기록 없음" in UI.
--
-- No RPC to update here: admin adjustments go through a direct INSERT from
-- `src/app/actions/points-admin.ts`, not a stored procedure.

alter table public.point_ledger
  add column if not exists handled_by text,
  add column if not exists handled_by_username text;
