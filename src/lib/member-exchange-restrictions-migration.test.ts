import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const restrictionMigration = readFileSync(
  new URL('../../supabase/migrations/288_member_exchange_restrictions.sql', import.meta.url),
  'utf8',
)
const scopeMigration = readFileSync(
  new URL(
    '../../supabase/migrations/294_restore_menhera_content_compliance_scope.sql',
    import.meta.url,
  ),
  'utf8',
)
const isolationMigration = readFileSync(
  new URL(
    '../../supabase/migrations/295_disable_non_menhera_content_compliance.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('member exchange restrictions migration contract', () => {
  it('keeps restrictions tenant-scoped, RLS-protected, and service-role only', () => {
    expect(restrictionMigration).toMatch(
      /primary key\s*\(\s*guild_id\s*,\s*discord_id\s*\)/i,
    )
    expect(restrictionMigration).toMatch(
      /alter table public\.member_exchange_restrictions enable row level security/i,
    )
    expect(restrictionMigration).toMatch(
      /revoke all on public\.member_exchange_restrictions from anon, authenticated/i,
    )
    expect(restrictionMigration).toMatch(
      /grant execute on function public\.set_member_exchange_restriction[\s\S]*to service_role/i,
    )
  })

  it('enforces active restrictions at the exchange insert boundary', () => {
    expect(restrictionMigration).toMatch(
      /create trigger exchange_requests_member_restriction_guard[\s\S]*before insert on public\.exchange_requests/i,
    )
    expect(restrictionMigration).toMatch(/EXCHANGE_TEMPORARILY_RESTRICTED/i)
  })

  it('restores a single Menhera entitlement and removes generic tenant bootstrapping', () => {
    expect(scopeMigration).toMatch(
      /create or replace function public\.alliance_content_compliance_enabled[\s\S]*t\.slug\s*=\s*'menhera'/i,
    )
    expect(scopeMigration).toMatch(
      /drop trigger if exists tenants_initialize_alliance_content_compliance[\s\S]*on public\.tenants/i,
    )
    expect(scopeMigration).toMatch(
      /drop function if exists public\.initialize_alliance_content_compliance\(\)/i,
    )
  })

  it('deactivates stale non-Menhera settings without deleting historical data', () => {
    expect(isolationMigration).toMatch(
      /update public\.app_settings setting[\s\S]*tenant\.slug is distinct from 'menhera'[\s\S]*setting\.value is distinct from 'false'/i,
    )
    expect(isolationMigration).not.toMatch(/\bdelete\s+from\b/i)
  })
})
