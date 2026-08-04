import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const initialMigration = readFileSync(
  new URL('../../supabase/migrations/367_public_zvz_entity_search.sql', import.meta.url),
  'utf8',
)
const forceEvidenceMigration = readFileSync(
  new URL('../../supabase/migrations/368_public_zvz_force_evidence.sql', import.meta.url),
  'utf8',
)

describe('public ZvZ entity search migration', () => {
  it('searches the selected season snapshot with a weekly fallback', () => {
    expect(initialMigration).toContain(
      'create or replace function public.search_public_zvz_entities',
    )
    expect(forceEvidenceMigration).toMatch(
      /join public\.guild_season_zvz_rollups rollup[\s\S]*rollup\.snapshot_date = period\.snapshot_date/i,
    )
    expect(forceEvidenceMigration).toMatch(
      /join public\.public_zvz_force_battle_evidence evidence[\s\S]*evidence\.battle_started_at >=[\s\S]*period\.period_start/i,
    )
    expect(forceEvidenceMigration).toContain('weekly_periods as')
    expect(forceEvidenceMigration).toContain("'guild'::text as entity_kind")
    expect(forceEvidenceMigration).toContain("'alliance'::text as entity_kind")
  })

  it('uses literal substring matching and keeps the RPC service-role-only', () => {
    expect(forceEvidenceMigration).toContain(
      'position(lower(v_query) in lower(rollup.guild_name)) > 0',
    )
    expect(forceEvidenceMigration).not.toMatch(/execute\s+format/i)
    expect(forceEvidenceMigration).toMatch(
      /revoke all on function public\.search_public_zvz_entities\([\s\S]*from public, anon, authenticated/i,
    )
    expect(forceEvidenceMigration).toMatch(
      /grant execute on function public\.search_public_zvz_entities\([\s\S]*to service_role/i,
    )
  })

  it('keeps fragmented official alliance fights without awarding sub-10 guild score evidence', () => {
    expect(forceEvidenceMigration).toContain(
      'create table if not exists public.public_zvz_force_battle_evidence',
    )
    expect(forceEvidenceMigration).toMatch(
      /a\.team_size >= 20[\s\S]*b\.team_size >= 20/i,
    )
    expect(forceEvidenceMigration).toMatch(
      /force\.force_level = 'alliance'[\s\S]*force\.team_size >= 10/i,
    )
    expect(forceEvidenceMigration).toContain(
      'refresh_guild_weekly_zvz_rollups_without_force_evidence',
    )
    expect(forceEvidenceMigration).toContain(
      'left join lateral unnest(evidence.guild_ids)',
    )
    expect(forceEvidenceMigration).toMatch(
      /revoke all on public\.public_zvz_force_battle_evidence from anon, authenticated/i,
    )
  })
})
