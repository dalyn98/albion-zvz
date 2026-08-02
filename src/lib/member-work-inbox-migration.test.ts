import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/349_member_work_inbox_snapshot.sql'),
  'utf8',
)

describe('migration 349 member work inbox snapshot', () => {
  it('normalizes member work without creating a copied state table', () => {
    expect(sql).toContain('create or replace function public.member_work_inbox_snapshot')
    expect(sql).not.toMatch(/create table/i)
    expect(sql).toContain("'action_required'")
    expect(sql).toContain("'waiting_on_guild'")
    expect(sql).toContain("'history'")
  })

  it('keeps mutations in the source modules and scopes every adapter to one tenant', () => {
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|public\.)/i)
    expect(sql).toContain('request.guild_id = p_guild_id')
    expect(sql).toContain('orders.guild_id = p_guild_id')
    expect(sql).toContain('task.guild_id = p_guild_id')
    expect(sql).toContain('allocation.guild_id = p_guild_id')
  })

  it('preserves regear history while hiding disabled optional module work', () => {
    expect(sql).toMatch(/from public\.regear_requests request[\s\S]*?request\.discord_id = p_discord_id/i)
    expect(sql).toContain("feature.state in ('enabled', 'draining')")
    expect(sql).toContain('where access.economy')
    expect(sql).toContain('where access.shop')
    expect(sql).toContain('where access.market')
    expect(sql).toContain('where access.supply')
  })

  it('distinguishes member, guild, counterparty, and operator next actors', () => {
    expect(sql).toContain("then 'member'")
    expect(sql).toContain("then 'guild'")
    expect(sql).toContain("then 'counterparty'")
    expect(sql).toContain("then 'operator'")
  })

  it('is service-role only and bounds history reads', () => {
    expect(sql).toMatch(
      /revoke all on function public\.member_work_inbox_snapshot\([\s\S]*?from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.member_work_inbox_snapshot\([\s\S]*?to service_role/i,
    )
    expect(sql).toContain('least(coalesce(p_history_limit, 50), 200)')
  })
})
