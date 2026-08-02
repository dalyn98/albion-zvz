import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/350_treasury_deposit_feature_boundary.sql'),
  'utf8',
)

describe('migration 350 treasury deposit feature boundary', () => {
  it('counts unallocated deposits as open economy work', () => {
    expect(sql).toMatch(
      /from public\.guild_treasury_deposits row[\s\S]*?row\.status = 'unallocated'/i,
    )
  })

  it('blocks new imports but lets source commands finish existing deposits', () => {
    expect(sql).toMatch(
      /before insert on public\.guild_treasury_deposits[\s\S]*?guard_guild_feature_intake\('guild_economy'\)/i,
    )
    expect(sql).not.toMatch(/treasury_deposit_allocations[\s\S]*?guard_guild_feature_intake/i)
  })

  it('rechecks draining after a deposit is allocated and keeps the helper private', () => {
    expect(sql).toMatch(
      /after insert or update or delete on public\.guild_treasury_deposits[\s\S]*?finalize_guild_feature_from_row\('guild_economy'\)/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.guild_feature_has_open_work\(uuid, text\)[\s\S]*?from public, anon, authenticated, service_role/i,
    )
  })
})
