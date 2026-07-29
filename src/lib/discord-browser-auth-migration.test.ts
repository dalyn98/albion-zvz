import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/287_discord_browser_auth.sql'),
  'utf8',
)

describe('Discord browser auth migration', () => {
  it('keeps raw credentials private and makes create/approve atomic service-role operations', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.discord_browser_auth_attempts',
    )
    expect(migrationSql).toMatch(/unique \(guild_id, code_hash\)/i)
    expect(migrationSql).toMatch(/browser_secret_hash text not null/i)
    expect(migrationSql).toMatch(/enable row level security/i)
    expect(migrationSql).toMatch(/pg_advisory_xact_lock/i)
    expect(migrationSql).toMatch(
      /revoke all on function public\.create_discord_browser_auth_attempt[\s\S]*from public, anon, authenticated/i,
    )
    expect(migrationSql).toMatch(
      /grant execute on function public\.approve_discord_browser_auth_attempt[\s\S]*to service_role/i,
    )
  })
})
