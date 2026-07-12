import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const backfillSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '252_backfill_role_reward_payout_rates.sql'),
  'utf8',
)
const contractSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '253_require_role_reward_payout_rates.sql'),
  'utf8',
)

describe('required role reward payout rate migrations', () => {
  it('backfills each legacy null rate from its own guild setting or 100%', () => {
    expect(backfillSql).toMatch(/update public\.role_rewards as reward/i)
    expect(backfillSql).toMatch(/setting\.guild_id = reward\.guild_id/i)
    expect(backfillSql).toMatch(/setting\.key = 'regear_payout_rate_percent'/i)
    expect(backfillSql).toMatch(/coalesce\([\s\S]*100/i)
    expect(backfillSql).toMatch(/where reward\.payout_rate_percent is null/i)
  })

  it('makes the bounded payout rate mandatory after the backfill', () => {
    expect(contractSql).toMatch(/alter column payout_rate_percent set not null/i)
    expect(contractSql).toMatch(/check \(payout_rate_percent >= 1 and payout_rate_percent <= 100\)/i)
  })
})
