import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/250_security_boundary_lockdown.sql'),
  'utf8',
)

describe('security boundary lockdown migration', () => {
  it('removes public PostgREST access while preserving the server service role', () => {
    expect(migrationSql).toMatch(/revoke all on all tables in schema public from public, anon, authenticated/i)
    expect(migrationSql).toMatch(/revoke execute on all functions in schema public from public, anon, authenticated/i)
    expect(migrationSql).toMatch(/grant select, insert, update, delete on all tables in schema public to service_role/i)
    expect(migrationSql).toMatch(/grant execute on all functions in schema public to service_role/i)
  })

  it('removes the legacy anonymous roster policies', () => {
    for (const table of ['events', 'parties', 'slots']) {
      expect(migrationSql).toContain(`drop policy if exists ${table}_select on public.${table}`)
    }
  })
})
