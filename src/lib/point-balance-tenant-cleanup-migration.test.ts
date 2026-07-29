import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/312_point_balance_tenant_cleanup.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('point balance tenant cleanup migration', () => {
  it('skips projection rebuilding only when the parent tenant is gone', () => {
    const deleteBranch = migration.slice(
      migration.indexOf("elsif tg_op = 'DELETE'"),
      migration.indexOf('end if;', migration.indexOf("elsif tg_op = 'DELETE'")) + 7,
    )

    expect(deleteBranch).toContain('from public.tenants tenant')
    expect(deleteBranch).toContain('tenant.id = old.guild_id')
    expect(deleteBranch).toContain('return old')
    expect(migration).toContain('public.apply_member_point_balance_delta')
  })
})
