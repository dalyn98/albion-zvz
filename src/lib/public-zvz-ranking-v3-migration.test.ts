import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schemaMigration = readFileSync(
  new URL(
    '../../supabase/migrations/387_public_zvz_v3_scores_and_item_power.sql',
    import.meta.url,
  ),
  'utf8',
)

const backfillMigration = readFileSync(
  new URL(
    '../../supabase/migrations/388_public_zvz_v3_scores_and_item_power_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ ranking v3 migrations', () => {
  it('keeps mobilization meaningful without letting it dominate the overall score', () => {
    expect(schemaMigration).toContain(
      '350::numeric * least(1::numeric, enriched.representative_size / 100)',
    )
    expect(schemaMigration).toContain(
      '350::numeric * enriched.combat_index / (enriched.combat_index + 30)',
    )
    expect(schemaMigration).toContain(
      '150::numeric * enriched.efficiency_index',
    )
    expect(schemaMigration).toContain("'agm_zvz_v3'")
  })

  it('uses full-side difficulty only for the bounded per-member efficiency component', () => {
    expect(schemaMigration).toMatch(
      /combat_contribution[\s\S]*greatest\(ordered\.own_team_size, 1\)[\s\S]*least\([\s\S]*1\.25::numeric[\s\S]*greatest\([\s\S]*0\.75::numeric[\s\S]*opponent_side_team_size::numeric[\s\S]*side_team_size/i,
    )
    expect(schemaMigration).toMatch(
      /when enriched\.scope = 'overall' and enriched\.efficiency_index > 0/i,
    )
    expect(schemaMigration).toMatch(
      /when enriched\.scope = 'overall'[\s\S]*else 700::numeric \* enriched\.combat_index/i,
    )
  })

  it('stores sampled IP without converting missing values to zero', () => {
    expect(schemaMigration).toContain('average_item_power numeric(10, 2)')
    expect(schemaMigration).toMatch(
      /item_power_sample_count = 0 and average_item_power is null/i,
    )
    expect(schemaMigration).toContain('apply_public_zvz_battle_item_power')
    expect(schemaMigration).toContain('trg_inherit_public_zvz_frozen_item_power')
    expect(schemaMigration).toMatch(
      /sum\(ordered\.average_item_power \* ordered\.item_power_sample_count\)/i,
    )
  })

  it('backfills frozen evidence and validates every rebuilt component', () => {
    expect(backfillMigration).toContain("battle.raw_battle->'players'")
    expect(backfillMigration).toContain('public.rebuild_public_zvz_v3_rollups')
    expect(backfillMigration).toContain('rollup.size_points > 350')
    expect(backfillMigration).toContain('rollup.efficiency_points > 150')
    expect(backfillMigration).toContain(
      "rollup.score_formula_version <> 'agm_zvz_v3'",
    )
  })
})
