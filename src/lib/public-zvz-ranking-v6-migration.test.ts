import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compatibilityMigration = readFileSync(
  new URL(
    '../../supabase/migrations/407_public_zvz_relative_p90_scoring.sql',
    import.meta.url,
  ),
  'utf8',
)
const activationMigration = readFileSync(
  new URL(
    '../../supabase/migrations/408_public_zvz_relative_p90_scoring_activation.sql',
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
      expect(compatibilityMigration).toContain(`add column if not exists ${column}`)
    }
    expect(compatibilityMigration).toContain("'agm_zvz_v6'")
  })

  it('uses ranked-entity P90 references isolated by server, snapshot, kind, and scope', () => {
    expect(activationMigration.match(/percentile_cont\(0\.9\)/g)).toHaveLength(4)
    expect(
      activationMigration.match(/filter \(where rollup\.sample_status = 'ranked'\)/g),
    ).toHaveLength(4)
    expect(activationMigration).toMatch(
      /group by\s+rollup\.season_id,\s+rollup\.snapshot_date,\s+rollup\.albion_server,\s+rollup\.entity_kind,\s+rollup\.scope/i,
    )
    expect(activationMigration).toContain(
      'and rollup.albion_server = reference.albion_server',
    )
  })

  it('keeps sparse cohorts below full credit with explicit reference floors', () => {
    expect(activationMigration).toContain('40::numeric')
    expect(activationMigration).toContain('60::numeric')
    expect(activationMigration).toContain('0.60::numeric')
    expect(activationMigration).toContain('10::numeric')
  })

  it('weights activity materially without letting scale dominate skill', () => {
    expect(activationMigration).toContain('300::numeric * least(')
    expect(activationMigration).toContain(
      'sqrt(rollup.representative_size / reference.size_reference)',
    )
    expect(activationMigration).toContain('then 300::numeric')
    expect(activationMigration).toContain('else 500::numeric')
    expect(activationMigration).toContain('then 200::numeric')
    expect(activationMigration).toContain('else 300::numeric')
    expect(activationMigration).toContain('200::numeric * least(')
    expect(activationMigration).toContain(
      'rollup.equivalent_battles / reference.activity_reference',
    )
  })

  it('does not activate publication before the compatible app deploys', () => {
    expect(compatibilityMigration).not.toContain(
      'create or replace function public.enforce_public_zvz_v2_comparable_scale_rollups',
    )
  })

  it('activates v6 publication, backfills snapshots, and validates the result', () => {
    expect(activationMigration).toContain(
      'create or replace function public.enforce_public_zvz_v2_comparable_scale_rollups',
    )
    expect(activationMigration).toContain(
      'perform public.rebuild_public_zvz_v6_rollups(',
    )
    expect(activationMigration).toContain(
      "where rollup.score_formula_version <> 'agm_zvz_v6'",
    )
    expect(activationMigration).toContain(
      "raise exception 'public ZvZ v6 cohort reference floors are invalid'",
    )
    expect(activationMigration).not.toContain(
      'refresh_public_zvz_v2_season_snapshots',
    )
  })
})
