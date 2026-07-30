import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const backfillSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '313_backfill_regear_support_state.sql'),
  'utf8',
)
const invariantSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '314_enforce_regear_support_writes.sql'),
  'utf8',
)

describe('regear support migrations', () => {
  it('preserves existing completed guild behaviour while leaving pending onboarding explicit', () => {
    expect(backfillSql).toMatch(/key,\s*value[\s\S]*'regear_support_enabled',\s*'true'/i)
    expect(backfillSql).toMatch(/where status <> 'pending'/i)
    expect(backfillSql).toMatch(/on conflict \(guild_id,\s*key\) do nothing/i)
  })

  it('fails closed for regear writes and history deletes without blocking tenant cascades or guild orders', () => {
    expect(invariantSql).toMatch(
      /regear_requests_require_support[\s\S]*before insert or update on public\.regear_requests/i,
    )
    expect(invariantSql).toMatch(
      /regear_windows_require_support[\s\S]*before insert or update on public\.regear_windows/i,
    )
    expect(invariantSql).toMatch(
      /new\.task_kind = 'regear'[\s\S]*old\.task_kind = 'regear'[\s\S]*REGEAR_SUPPORT_DISABLED/i,
    )
    expect(invariantSql).toMatch(
      /regear_requests_require_support_delete[\s\S]*before delete on public\.regear_requests/i,
    )
    expect(invariantSql).toMatch(
      /exists \(select 1 from public\.tenants where id = old\.guild_id\)/i,
    )
    expect(invariantSql).toMatch(
      /tg_op = 'UPDATE'[\s\S]*is_regear_support_enabled\(old\.guild_id\)/i,
    )
  })

  it('skips unsupported historical deliveries during the global expiry sweep', () => {
    expect(invariantSql).toMatch(
      /create or replace function public\.expire_craft_tasks\(\)[\s\S]*task_kind = 'regear'[\s\S]*is_regear_support_enabled\(guild_id\)/i,
    )
  })
})
