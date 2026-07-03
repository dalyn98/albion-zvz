import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '239_consolidate_dps_roles.sql'),
  'utf8',
)

describe('DPS role consolidation migration', () => {
  it('normalizes persisted DPS role values to EngageDps', () => {
    expect(migrationSql).toMatch(/update\s+public\.slots[\s\S]*set\s+role_name\s*=\s*'EngageDps'/i)
    expect(migrationSql).toMatch(/update\s+public\.regear_requests[\s\S]*set\s+role_name\s*=\s*'EngageDps'/i)
    expect(migrationSql).toMatch(/update\s+public\.event_regear_participants[\s\S]*set\s+role_name\s*=\s*'EngageDps'/i)
    expect(migrationSql).toContain('create temporary table agm_merged_build_role_demands')
    expect(migrationSql).toMatch(/insert\s+into\s+public\.event_build_role_demands[\s\S]*'EngageDps'/i)
    expect(migrationSql).toMatch(/update\s+public\.event_build_applications[\s\S]*set\s+role_type\s*=\s*'EngageDps'/i)
  })

  it('normalizes array, JSONB, settings, rewards, and check constraints', () => {
    expect(migrationSql).toContain('public.agm_consolidate_dps_role_jsonb')
    expect(migrationSql).toMatch(/update\s+public\.event_tentative_signups[\s\S]*possible_roles/i)
    expect(migrationSql).toMatch(/update\s+public\.app_settings[\s\S]*set\s+value\s*=\s*'\["EngageDps"\]'/i)
    expect(migrationSql).toMatch(/where\s+key\s*=\s*'cd_badge_roles'/i)
    expect(migrationSql).toMatch(/delete\s+from\s+public\.role_rewards[\s\S]*\('Dps',\s*'BrawlerDps'\)/i)
    expect(migrationSql).toMatch(/event_regear_participants_role_name_check[\s\S]*EngageDps[\s\S]*BM[\s\S]*기타/i)
    expect(migrationSql).not.toMatch(/add constraint[\s\S]*\bBrawlerDps\b/i)
  })
})
