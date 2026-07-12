import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '254_member_trade_listing_lifecycle.sql'),
  'utf8',
)

describe('member trade listing lifecycle migration', () => {
  it('locks the seller-owned listing inside a tenant-scoped lifecycle RPC', () => {
    expect(migrationSql).toMatch(/create or replace function public\.update_member_trade_listing_lifecycle/i)
    expect(migrationSql).toMatch(/security definer/i)
    expect(migrationSql).toMatch(/set search_path = public/i)
    expect(migrationSql).toMatch(/guild_id = p_guild_id/i)
    expect(migrationSql).toMatch(/seller_discord_id = p_seller_discord_id/i)
    expect(migrationSql).toMatch(/for update/i)
  })

  it('only permits supported transitions and safely retires pending offers on close', () => {
    expect(migrationSql).toMatch(/p_action not in \('pause', 'resume', 'close'\)/i)
    expect(migrationSql).toMatch(/v_listing\.status <> 'active'/i)
    expect(migrationSql).toMatch(/v_listing\.status <> 'paused'/i)
    expect(migrationSql).toMatch(/v_listing\.quantity_available <= 0/i)
    expect(migrationSql).toMatch(/set status = 'closed'/i)
    expect(migrationSql).toMatch(/update public\.member_trade_price_offers/i)
    expect(migrationSql).toMatch(/and status = 'pending'/i)
  })

  it('keeps execution restricted to the server service role', () => {
    expect(migrationSql).toMatch(/revoke all on function public\.update_member_trade_listing_lifecycle/i)
    expect(migrationSql).toMatch(/grant execute on function public\.update_member_trade_listing_lifecycle[\s\S]*to service_role/i)
  })
})
