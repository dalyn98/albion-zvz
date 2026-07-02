import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '237_role_reward_payout_rates.sql'),
  'utf8',
)

describe('role reward payout rate migration', () => {
  it('adds a nullable per-role payout rate override with tenant-scoped role rewards intact', () => {
    expect(migrationSql).toMatch(/alter table public\.role_rewards[\s\S]*add column if not exists payout_rate_percent integer/i)
    expect(migrationSql).toMatch(/check \(payout_rate_percent is null or \(payout_rate_percent >= 1 and payout_rate_percent <= 100\)\)/i)
    expect(migrationSql).toMatch(/primary key \(guild_id, role_name\)/i)
  })
})
