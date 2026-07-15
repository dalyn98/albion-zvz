import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '266_allow_role_regear_bonus_rates.sql'),
  'utf8',
)

describe('role regear bonus rate migration', () => {
  it('raises every role-specific payout constraint to 1000%', () => {
    expect(migrationSql).toMatch(
      /alter table public\.role_rewards[\s\S]*payout_rate_percent >= 1 and payout_rate_percent <= 1000/i,
    )
    expect(migrationSql).toMatch(
      /alter table public\.regear_discord_role_policies[\s\S]*payout_rate_percent >= 1 and payout_rate_percent <= 1000/i,
    )
    expect(migrationSql).toMatch(
      /alter table public\.event_regear_role_overrides[\s\S]*payout_rate_percent >= 1 and payout_rate_percent <= 1000/i,
    )
  })

  it('allows the silver approval RPC to credit above the claim ceiling safely', () => {
    expect(migrationSql).toMatch(/create or replace function public\.approve_regear_request/i)
    expect(migrationSql).toMatch(/v_max_credit/i)
    expect(migrationSql).toMatch(/2147483647/)
    expect(migrationSql).not.toMatch(/if v_credit > v_cap then v_credit := v_cap/i)
  })

  it('keeps automatic and crafted payout snapshots aligned with bonus rates', () => {
    expect(migrationSql).toMatch(/create or replace function public\.create_auto_regear_request/i)
    expect(migrationSql).toMatch(/create or replace function public\.approve_regear_as_crafted/i)
    expect(migrationSql).toMatch(/create or replace function public\.approve_regear_from_stock/i)
  })
})
