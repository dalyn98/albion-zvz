import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rulesMigration = readFileSync(
  new URL(
    '../../supabase/migrations/401_public_zvz_small_10_to_20.sql',
    import.meta.url,
  ),
  'utf8',
)

const backfillMigration = readFileSync(
  new URL(
    '../../supabase/migrations/402_public_zvz_small_10_to_20_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)

const restoreMigration = readFileSync(
  new URL(
    '../../supabase/migrations/403_public_zvz_restore_large_projection_runs.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ Small 10-20 migrations', () => {
  it('allows final Small evidence from 10 while retaining the Mid+ 20 floor', () => {
    expect(rulesMigration).toContain(
      'least(home_side_team_size, opponent_side_team_size) >= 10',
    )
    expect(rulesMigration).toContain(
      'greatest(home_side_team_size, opponent_side_team_size) <= 20',
    )
    expect(rulesMigration).toContain(
      'or least(home_side_team_size, opponent_side_team_size) >= 20',
    )
    expect(rulesMigration).toContain('opponent_side_team_size >= 10')
    expect(rulesMigration).toContain("'agm_zvz_v2_small10_comp75'")
  })

  it('widens the indexed backfill scan without changing the exact app rule', () => {
    expect(rulesMigration).toContain(
      'idx_battle_records_zvz_small_candidate_started',
    )
    expect(rulesMigration).toContain('battle.total_players >= 20')
    expect(rulesMigration).toContain('list_public_zvz_projection_backfill_candidates')
    expect(rulesMigration).toContain('to service_role')
  })

  it('invalidates only current-season projection checkpoints', () => {
    expect(backfillMigration).toContain(
      'delete from public.public_zvz_battle_projection_runs',
    )
    expect(backfillMigration).toContain('get_public_zvz_season_bounds')
    expect(backfillMigration).toContain('battle.total_players >= 20')
    expect(backfillMigration).not.toContain(
      'delete from public.public_zvz_v2_season_snapshots',
    )
  })

  it('restores preserved 40+ checkpoints and leaves new Small candidates pending', () => {
    expect(restoreMigration).toContain('battle.total_players >= 40')
    expect(restoreMigration).toContain('home.team_size >= 20')
    expect(restoreMigration).toContain('public_zvz_engagements')
    expect(restoreMigration).toContain('public_zvz_battle_projection_runs')
    expect(restoreMigration).toContain('on conflict (battle_record_id) do nothing')
    expect(restoreMigration).toContain("clock_timestamp() - interval '7 hours'")
    expect(restoreMigration).not.toContain(
      'delete from public.public_zvz_v2_season_snapshots',
    )
  })
})
