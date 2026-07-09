import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '246_reintroduce_brawl_dps_role.sql'),
  'utf8',
)

describe('Brawl DPS role migration', () => {
  it('allows BrawlerDps in participant and build-sheet role checks', () => {
    expect(migrationSql).toMatch(/insert\s+into\s+public\.role_rewards[\s\S]*'BrawlerDps'/i)
    expect(migrationSql).toMatch(/on\s+conflict\s+\(guild_id,\s*role_name\)\s+do\s+nothing/i)
    expect(migrationSql).toMatch(/event_regear_participants_role_name_check[\s\S]*BrawlerDps/i)
    expect(migrationSql).toMatch(/event_build_role_demands_role_type_check[\s\S]*BrawlerDps/i)
    expect(migrationSql).toMatch(/event_build_applications_role_type_check[\s\S]*BrawlerDps/i)
  })
})
