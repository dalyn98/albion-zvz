-- 400: Preserve the audited refresh timeout on the exact-bound wrappers.
--
-- Migration 392 wrapped the original functions but did not carry their
-- function-level statement_timeout. PostgREST's shorter role default could
-- therefore cancel a valid single-day refresh before the legacy body applied
-- its own setting.

alter function public.refresh_guild_zvz_season_snapshots(uuid, date, boolean)
  set statement_timeout = '180s';
alter function public.refresh_public_zvz_v2_season_snapshots(uuid, date, boolean)
  set statement_timeout = '180s';
alter function public.refresh_public_zvz_v2_season_snapshot_day(uuid, date)
  set statement_timeout = '180s';

alter function public.refresh_current_guild_zvz_season_snapshots()
  set statement_timeout = '180s';
alter function public.refresh_current_public_zvz_v2_season_snapshots()
  set statement_timeout = '180s';

alter function public.refresh_all_guild_zvz_season_snapshots(text, boolean)
  set statement_timeout = '300s';
alter function public.refresh_all_public_zvz_v2_season_snapshots(text, boolean)
  set statement_timeout = '300s';
