import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rankingMigration = readFileSync(
  new URL(
    '../../supabase/migrations/381_public_zvz_comparable_scale_rankings.sql',
    import.meta.url,
  ),
  'utf8',
)

const backfillMigration = readFileSync(
  new URL(
    '../../supabase/migrations/382_public_zvz_comparable_scale_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ comparable-scale migrations', () => {
  it('normalizes both perspectives to the larger side scale', () => {
    expect(rankingMigration).toContain(
      'greatest(\n    new.home_side_team_size,\n    new.opponent_side_team_size',
    )
    expect(rankingMigration).toContain("new.qualification_version := 'agm_zvz_v2_comp75'")
    expect(rankingMigration).toContain('trg_normalize_public_zvz_engagement_scale')
  })

  it('keeps overall rows and rebuilds scale rows at the exact 75 percent boundary', () => {
    expect(rankingMigration).toMatch(
      /least\([\s\S]*side_team_size[\s\S]*\) \* 4 >= greatest\([\s\S]*side_team_size[\s\S]*\) \* 3/,
    )
    expect(rankingMigration).toContain("rollup.scope <> 'overall'")
    expect(rankingMigration).toContain('trg_enforce_public_zvz_v2_comparable_scale_rollups')
    expect(rankingMigration).toContain('referencing new table as inserted_public_zvz_rollups')
  })

  it('backfills canonical scale evidence without deleting historical snapshots', () => {
    expect(backfillMigration).toContain('update public.public_zvz_engagements')
    expect(backfillMigration).toContain('update public.public_zvz_v2_season_evidence')
    expect(backfillMigration).toContain(
      'public.rebuild_public_zvz_v2_comparable_scale_rollups',
    )
    expect(backfillMigration).not.toContain(
      'delete from public.public_zvz_v2_season_snapshots',
    )
  })
})
