import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/360_public_zvz_seasons.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ seasons migration', () => {
  it('stores operator-defined boundaries and tenant-neutral daily history', () => {
    expect(migration).toContain('create table if not exists public.zvz_seasons')
    expect(migration).toContain('unique (albion_server, starts_on)')
    expect(migration).toContain(
      'create table if not exists public.zvz_season_snapshots',
    )
    expect(migration).toContain(
      'create table if not exists public.guild_season_zvz_rollups',
    )
    expect(migration).toContain(
      'create table if not exists public.guild_season_zvz_battle_evidence',
    )
    expect(migration).not.toMatch(/interval '3 months'/i)
    expect(migration).toMatch(
      /select min\(next_season\.starts_on\)[\s\S]*next_season\.starts_on > season\.starts_on/i,
    )
  })

  it('keeps every season table service-role-only behind RLS', () => {
    for (const table of [
      'zvz_seasons',
      'zvz_season_snapshots',
      'guild_season_zvz_rollups',
      'guild_season_zvz_battle_evidence',
    ]) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      )
      expect(migration).toMatch(
        new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i'),
      )
      expect(migration).toMatch(
        new RegExp(
          `grant select, insert, update, delete\\s+on public\\.${table}\\s+to service_role`,
          'i',
        ),
      )
    }
  })

  it('recomputes cumulative facts with the same official formula', () => {
    expect(migration).toContain('e.battle_started_at >=')
    expect(migration).toContain('day.snapshot_date + 1')
    expect(migration).toMatch(
      /join public\.guild_season_zvz_battle_evidence e[\s\S]*e\.evidence_date between v_season_start and day\.snapshot_date/i,
    )
    expect(migration).toContain('c.zvz_battles * 25')
    expect(migration).toContain('c.kills * 3')
    expect(migration).toContain('greatest(c.kills - c.deaths, 0) * 2')
    expect(migration).toContain('c.kill_fame::numeric / 500000')
    expect(migration).toContain('c.avg_force_size * 1.5')
    expect(migration).toContain('greatest(c.deaths - c.kills, 0) * 0.5')
    expect(migration).not.toContain('sum(weekly')
  })

  it('corrects only the recent 48-hour window unless an operator forces a rebuild', () => {
    expect(migration).toContain("clock_timestamp() - interval '48 hours'")
    expect(migration).toMatch(
      /where p_force[\s\S]*or not exists[\s\S]*existing\.is_final/i,
    )
    expect(migration).toContain('snapshot_date = any(v_dates)')
    expect(migration).toContain(
      'refresh_current_guild_zvz_season_snapshots',
    )
    expect(migration).toMatch(
      /lead\(season\.starts_on\)[\s\S]*bounded\.next_start >= v_today - 2/i,
    )
    expect(migration).toMatch(
      /pending\.season_id = bounded\.id[\s\S]*not pending\.is_final/i,
    )
    expect(migration).toContain(
      "(clock_timestamp() at time zone 'UTC')::date",
    )
  })
})
