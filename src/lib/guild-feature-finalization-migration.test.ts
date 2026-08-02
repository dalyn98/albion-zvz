import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/352_guard_feature_finalization_during_tenant_delete.sql',
  ),
  'utf8',
)

describe('migration 352 feature finalization tenant-delete guard', () => {
  it('no-ops when the feature row was already removed by tenant cascade', () => {
    expect(sql).toMatch(
      /if v_previous\.guild_id is null then\s+return false;/i,
    )
    expect(sql.indexOf('if v_previous.guild_id is null')).toBeLessThan(
      sql.indexOf("if v_previous.state <> 'draining'"),
    )
  })

  it('preserves normal draining completion and service-role access', () => {
    expect(sql).toContain('public.guild_feature_has_open_work')
    expect(sql).toContain("'draining_complete'")
    expect(sql).toMatch(
      /grant execute on function public\.finalize_draining_guild_feature\(uuid, text\)[\s\S]*to service_role/i,
    )
  })
})
