import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/390_public_zvz_kd_efficiency_v5.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ ranking v5 migration', () => {
  it('triples the excess-death penalty and reduces kill-fame dominance', () => {
    expect(migration).toMatch(
      /kill_fame::numeric \/ 750000[\s\S]*greatest\(evidence\.deaths - evidence\.kills, 0\) \* 1\.5/i,
    )
    expect(migration).not.toContain('greatest(evidence.kills - evidence.deaths, 0) * 2')
  })

  it('uses a bounded smoothed kill share for direct K/D efficiency', () => {
    expect(migration).toMatch(
      /aggregated\.kills \+ aggregated\.engagement_count \* 5[\s\S]*aggregated\.kills[\s\S]*aggregated\.deaths[\s\S]*aggregated\.engagement_count \* 10/i,
    )
    expect(migration).toContain('200::numeric * metrics.efficiency_index')
    expect(migration).toContain('300::numeric * metrics.efficiency_index')
  })

  it('keeps mobilization overall-only and gives every ranking scope 1000 points', () => {
    expect(migration).toContain('public.rebuild_public_zvz_v4_rollups_legacy')
    expect(migration).toContain('300::numeric * metrics.combat_index')
    expect(migration).toContain('550::numeric * metrics.combat_index')
    expect(migration).toContain('150::numeric * least(')
    expect(migration).toContain("score_formula_version = 'agm_zvz_v5'")
  })

  it('rebuilds all snapshots and validates the published v5 bounds', () => {
    expect(migration).toContain('public.rebuild_public_zvz_v5_rollups')
    expect(migration).toContain('legacy public ZvZ score rows remain after v5 rebuild')
    expect(migration).toContain('rollup.efficiency_index > 1')
    expect(migration).toContain('rollup.combat_points > 550')
  })
})
