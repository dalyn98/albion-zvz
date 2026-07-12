import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/251_auth_session_security.sql'),
  'utf8',
)

describe('auth session security migration', () => {
  it('uses service-only atomic rate limits and a private session revocation authority', () => {
    expect(migrationSql).toContain('create table if not exists public.local_guild_auth_attempts')
    expect(migrationSql).toContain('create table if not exists public.tenant_session_revocations')
    expect(migrationSql).toMatch(/pg_advisory_xact_lock/i)
    expect(migrationSql).toMatch(/grant execute on function public\.consume_local_guild_auth_attempt/i)
    expect(migrationSql).toMatch(/to service_role/i)
    expect(migrationSql).toMatch(/create trigger.*permission_role_grants_session_revocation/i)
    expect(migrationSql).toMatch(/create trigger.*guild_avatars_session_revocation/i)
  })
})
