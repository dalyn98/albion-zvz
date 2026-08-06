import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8')
}

describe('public ZvZ exact season boundary migrations', () => {
  const contract = migration('392_public_zvz_exact_season_boundaries.sql')
  const season33 = migration('393_public_zvz_season_33_server_times.sql')
  const compatibility = migration('395_public_zvz_season_boundary_write_compat.sql')
  const search = migration('396_public_zvz_exact_season_search.sql')
  const partialDay = migration('397_public_zvz_partial_day_snapshot_bounds.sql')
  const projectionRetry = migration('398_public_zvz_projection_retry_cooldown.sql')
  const conflictCleanup = migration('399_public_zvz_season_33_conflict_cleanup.sql')
  const refreshTimeouts = migration('400_public_zvz_refresh_timeouts.sql')

  it('stores exact inclusive starts and exclusive ends without replacing season ids', () => {
    expect(contract).toContain('add column if not exists starts_at timestamptz')
    expect(contract).toContain('add column if not exists ends_at timestamptz')
    expect(contract).toContain('get_public_zvz_season_bounds')
    expect(contract).toContain('enforce_public_zvz_season_evidence_bounds')
    expect(season33).toContain("'east',\n    'Season 33'")
    expect(season33).toContain("timestamptz '2026-07-04 00:00:00+00'")
    expect(season33.match(/timestamptz '2026-07-04 11:00:00\+00'/g)).toHaveLength(6)
    expect(season33).toContain("timestamptz '2026-09-01 00:00:00+00'")
    expect(season33).not.toContain('delete from public.zvz_seasons')
  })

  it('keeps daily snapshots and every ingestion path on the exact bounds', () => {
    expect(contract).toContain('refresh_guild_zvz_season_snapshots_date_legacy')
    expect(contract).toContain('refresh_public_zvz_v2_season_snapshots_date_legacy')
    expect(contract).toContain('bounds.starts_at <= clock_timestamp()')
    expect(contract).toContain('battle.started_at >= season.starts_at')
    expect(search).toContain('bounds.last_snapshot_date')
    expect(partialDay).toContain(
      'data_through_at = least(snapshot.data_through_at, v_bounds.ends_at)',
    )
    expect(projectionRetry).toContain('battle.started_at >= season.starts_at')
    expect(projectionRetry).toContain(
      "run.projected_at > clock_timestamp() - interval '6 hours'",
    )
    expect(conflictCleanup).toContain("season.name = 'Season 2026-08-31'")
    expect(conflictCleanup).toContain('refresh_public_zvz_v2_season_snapshot_day')
    expect(conflictCleanup).toContain('target snapshot was not rebuilt')
    expect(refreshTimeouts).toContain(
      'refresh_public_zvz_v2_season_snapshot_day(uuid, date)',
    )
    expect(refreshTimeouts.match(/set statement_timeout = '180s'/g)).toHaveLength(5)
    expect(refreshTimeouts.match(/set statement_timeout = '300s'/g)).toHaveLength(2)
  })

  it('supports old date-only writes while exact admin writes are deployed', () => {
    expect(compatibility).toContain('sync_public_zvz_season_start_columns')
    expect(compatibility).toContain(
      "new.starts_at := new.starts_on::timestamp at time zone 'UTC'",
    )
    expect(contract).toContain('uuid, text, text, date, text')
    expect(contract).toContain('uuid, text, text, timestamptz, timestamptz, text')
  })
})
