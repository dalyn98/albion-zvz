import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('public guild profile safe defaults migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/297_public_guild_profile_safe_defaults.sql',
    ),
    'utf8',
  )

  it('backfills every sensitive section as private without overwriting explicit choices', () => {
    expect(sql).toContain("'guild_profile_show_admin_team'")
    expect(sql).toContain("'guild_profile_show_leaderboard'")
    expect(sql).toContain("'guild_profile_show_regear_stats'")
    expect(sql).toMatch(/select tenant\.id,\s*private_section\.key,\s*'false'/i)
    expect(sql).toMatch(/on conflict\s*\(\s*guild_id\s*,\s*key\s*\)\s*do nothing/i)
    expect(sql).not.toMatch(/do update/i)
  })
})
