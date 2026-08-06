import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/389_public_zvz_observed_mobilization_curve.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ ranking v4 migration', () => {
  it('uses directly observed representative deployment with no player hard cap', () => {
    expect(migration).toMatch(
      /350::numeric \* rollup\.representative_size[\s\S]*rollup\.representative_size \+ 100::numeric/i,
    )
    expect(migration).not.toMatch(/least\([\s\S]{0,120}representative_size/i)
    expect(migration).toContain('never inferred queue or adjacent-cluster reserves')
  })

  it('publishes and backfills the audited v4 formula', () => {
    expect(migration).toContain("score_formula_version = 'agm_zvz_v4'")
    expect(migration).toContain('public.rebuild_public_zvz_v4_rollups')
    expect(migration).toContain('legacy public ZvZ score rows remain after v4 rebuild')
    expect(migration).toContain('rollup.size_points >= 350')
  })

  it('keeps scale rankings free of an extra mobilization component', () => {
    expect(migration).toMatch(
      /when rollup\.scope = 'overall'[\s\S]*else 0::numeric/i,
    )
  })
})
