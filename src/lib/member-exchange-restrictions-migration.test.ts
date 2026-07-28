import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/288_member_exchange_restrictions.sql', import.meta.url),
  'utf8',
)

describe('member exchange restrictions migration contract', () => {
  it('keeps restrictions tenant-scoped, RLS-protected, and service-role only', () => {
    expect(migration).toMatch(
      /primary key\s*\(\s*guild_id\s*,\s*discord_id\s*\)/i,
    )
    expect(migration).toMatch(
      /alter table public\.member_exchange_restrictions enable row level security/i,
    )
    expect(migration).toMatch(
      /revoke all on public\.member_exchange_restrictions from anon, authenticated/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.set_member_exchange_restriction[\s\S]*to service_role/i,
    )
  })

  it('enforces active restrictions at the exchange insert boundary', () => {
    expect(migration).toMatch(
      /create trigger exchange_requests_member_restriction_guard[\s\S]*before insert on public\.exchange_requests/i,
    )
    expect(migration).toMatch(/EXCHANGE_TEMPORARILY_RESTRICTED/i)
  })

  it('seeds participation compliance for existing and future tenants without a slug gate', () => {
    expect(migration).toMatch(
      /insert into public\.app_settings[\s\S]*from public\.tenants[\s\S]*alliance_content_compliance_enabled/i,
    )
    expect(migration).toMatch(
      /create trigger tenants_initialize_alliance_content_compliance[\s\S]*after insert on public\.tenants/i,
    )
    expect(migration).not.toMatch(/t\.slug\s*=\s*'menhera'/i)
  })
})
