import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '249_regear_discord_role_policy_payout_rates.sql'),
  'utf8',
)

describe('Discord role regear policy payout rate migration', () => {
  it('adds a nullable legacy-safe payout rate with a bounded constraint', () => {
    expect(migrationSql).toMatch(
      /alter table public\.regear_discord_role_policies[\s\S]*add column if not exists payout_rate_percent integer/i,
    )
    expect(migrationSql).toMatch(
      /payout_rate_percent is null\s+or \(payout_rate_percent >= 1 and payout_rate_percent <= 100\)/i,
    )
  })
})
