import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/407_public_zvz_relative_p90_scoring.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ ranking v6 migration', () => {
  it('stores the cohort references beside every historical score', () => {
    for (const column of [
      'size_reference',
      'combat_reference',
      'efficiency_reference',
      'activity_reference',
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`)
    }
    expect(migration).toContain("'agm_zvz_v6'")
  })

  it('uses ranked-entity P90 references within each snapshot, kind, and scope', () => {
    expect(migration.match(/percentile_cont\(0\.9\)/g)).toHaveLength(4)
    expect(migration.match(/filter \(where rollup\.sample_status = 'ranked'\)/g)).toHaveLength(4)
    expect(migration).toMatch(
      /group by\s+rollup\.season_id,\s+rollup\.snapshot_date,\s+rollup\.entity_kind,\s+rollup\.scope/i,
    )
  })

  it('keeps sparse cohorts below full credit with explicit reference floors', () => {
    expect(migration).toContain('40::numeric')
    expect(migration).toContain('60::numeric')
    expect(migration).toContain('0.60::numeric')
    expect(migration).toContain('10::numeric')
  })

  it('weights activity materially without letting scale dominate skill', () => {
    expect(migration).toContain('300::numeric * least(')
    expect(migration).toContain('sqrt(rollup.representative_size / reference.size_reference)')
    expect(migration).toContain('then 300::numeric')
    expect(migration).toContain('else 500::numeric')
    expect(migration).toContain('then 200::numeric')
    expect(migration).toContain('else 300::numeric')
    expect(migration).toContain('200::numeric * least(')
    expect(migration).toContain(
      'rollup.equivalent_battles / reference.activity_reference',
    )
  })

  it('does not activate publication before the compatible app deploys', () => {
    expect(migration).not.toContain(
      'create or replace function public.enforce_public_zvz_v2_comparable_scale_rollups',
    )
  })
})
