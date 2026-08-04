import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(
  new URL('../../supabase/migrations/319_public_zvz_ranking_evidence.sql', import.meta.url),
  'utf8',
)
const backfill = readFileSync(
  new URL(
    '../../supabase/migrations/320_backfill_public_zvz_ranking_evidence.sql',
    import.meta.url,
  ),
  'utf8',
)
const thresholdFix = readFileSync(
  new URL('../../supabase/migrations/366_fix_public_zvz_20_player_threshold.sql', import.meta.url),
  'utf8',
)

describe('public ZvZ ranking evidence migration', () => {
  it('stores tenant-neutral battle-time facts behind service-role RLS', () => {
    expect(schema).toContain('create table if not exists public.guild_weekly_zvz_battle_evidence')
    expect(schema).toContain('battle_started_at timestamptz not null')
    expect(schema).toContain('alliance_albion_id text')
    expect(schema).toContain('qualification_version text not null')
    expect(schema).not.toMatch(
      /create table if not exists public\.guild_weekly_zvz_battle_evidence[\s\S]{0,1800}tenant_id/i,
    )
    expect(schema).toMatch(
      /alter table public\.guild_weekly_zvz_battle_evidence enable row level security/i,
    )
    expect(schema).toMatch(
      /revoke all on public\.guild_weekly_zvz_battle_evidence from anon, authenticated/i,
    )
    expect(schema).toMatch(/grant select, insert, update, delete[\s\S]*to service_role/i)
  })

  it('persists the exact aggregate formula without inventing per-battle points', () => {
    for (const column of [
      'score_formula_version',
      'battle_points',
      'kill_points',
      'kd_bonus_points',
      'kill_fame_points',
      'force_size_points',
      'death_penalty_points',
    ]) {
      expect(schema).toContain(column)
    }
    expect(schema).toContain('c.zvz_battles * 25')
    expect(schema).toContain('c.kills * 3')
    expect(schema).toContain('greatest(c.kills - c.deaths, 0) * 2')
    expect(schema).toContain('c.kill_fame::numeric / 500000')
    expect(schema).toContain('c.avg_force_size * 1.5')
    expect(schema).toContain('greatest(c.deaths - c.kills, 0) * 0.5')
    expect(schema).not.toContain('per_battle_points')
  })

  it('refreshes one locked week and keeps alliance identity from each battle', () => {
    expect(schema).toContain('pg_advisory_xact_lock')
    expect(schema).toMatch(
      /delete from public\.guild_weekly_zvz_battle_evidence\s+where week_start = v_week_start/i,
    )
    expect(schema).toMatch(
      /delete from public\.guild_weekly_zvz_rollups\s+where week_start = v_week_start/i,
    )
    expect(schema).toMatch(/bfs\.alliance_id,[\s\S]*bfs\.alliance_name,[\s\S]*bfs\.team_size/i)
    expect(schema).toMatch(
      /array_agg\([\s\S]*e\.alliance_albion_id[\s\S]*order by e\.battle_started_at desc/i,
    )
  })

  it('backfills every already-retained week separately from the schema change', () => {
    expect(backfill).toContain('array_agg(distinct week_start order by week_start)')
    expect(backfill).toContain('perform public.refresh_guild_weekly_zvz_rollups(v_week_start)')
  })

  it('includes exact 20-player fights and allows busy weeks to finish', () => {
    expect(thresholdFix).toMatch(/a\.team_size >= 20/i)
    expect(thresholdFix).toMatch(/b\.team_size >= 20/i)
    expect(thresholdFix).not.toMatch(/[ab]\.team_size >= 21/i)
    expect(thresholdFix).toContain("set statement_timeout = '120s'")
    expect(thresholdFix).toContain("'agm_zvz_v2_20plus'")
    expect(thresholdFix).toMatch(
      /revoke all on function public\.refresh_guild_weekly_zvz_rollups\(date\)[\s\S]*from public, anon, authenticated/i,
    )
  })
})
