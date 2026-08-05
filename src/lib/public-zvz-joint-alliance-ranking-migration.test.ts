import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const guardMigration = readFileSync(
  new URL(
    '../../supabase/migrations/383_public_zvz_joint_alliance_ranking_guard.sql',
    import.meta.url,
  ),
  'utf8',
)

const backfillMigration = readFileSync(
  new URL(
    '../../supabase/migrations/384_public_zvz_joint_alliance_ranking_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)

const validationMigration = readFileSync(
  new URL(
    '../../supabase/migrations/385_public_zvz_joint_alliance_ranking_validate.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ joint-alliance ranking migrations', () => {
  it('drops stale single-guild alliance rows without rejecting their guild evidence', () => {
    expect(guardMigration).toContain(
      'trg_ignore_public_zvz_single_guild_alliance_evidence',
    )
    expect(guardMigration).toMatch(
      /if new\.entity_kind = 'alliance'[\s\S]*new\.participation_kind <> 'joint_sortie'[\s\S]*return null/i,
    )
    expect(guardMigration).toContain(
      'public_zvz_alliance_evidence_requires_joint_sortie',
    )
    expect(guardMigration).toContain(
      'public_zvz_season_alliance_evidence_requires_joint_sortie',
    )
  })

  it('validates two directly observed guilds after the engagement batch is complete', () => {
    expect(guardMigration).toContain(
      'create constraint trigger trg_validate_public_zvz_joint_alliance_evidence',
    )
    expect(guardMigration).toContain('deferrable initially deferred')
    expect(guardMigration).toContain(
      'count(distinct guild_evidence.entity_albion_id)',
    )
    expect(guardMigration).toMatch(
      /guild_evidence\.alliance_albion_id\s*=\s*alliance_evidence\.entity_albion_id/i,
    )
    expect(guardMigration).toMatch(
      /guild_evidence\.participation_kind = 'joint_sortie'[\s\S]*\) < 2/i,
    )
  })

  it('repairs only alliance score evidence and rebuilds affected season snapshots', () => {
    expect(backfillMigration).toMatch(
      /delete from public\.public_zvz_entity_engagement_evidence alliance_evidence[\s\S]*alliance_evidence\.entity_kind = 'alliance'/i,
    )
    expect(backfillMigration).toContain(
      'public.refresh_public_zvz_v2_season_snapshots',
    )
    expect(backfillMigration).not.toContain('validate constraint')
    expect(backfillMigration).not.toContain(
      'delete from public.public_zvz_engagements',
    )
    expect(backfillMigration).not.toContain('delete from public.battle_records')
  })

  it('validates constraints only after the data migration transaction commits', () => {
    expect(validationMigration).toContain(
      'validate constraint public_zvz_alliance_evidence_requires_joint_sortie',
    )
    expect(validationMigration).toContain(
      'validate constraint public_zvz_season_alliance_evidence_requires_joint_sortie',
    )
    expect(validationMigration).not.toContain('delete from')
  })
})
