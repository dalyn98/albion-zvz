import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/337_shop_price_review_and_recovery_receipts.sql'),
  'utf8',
)

describe('shop price review and recovery migration', () => {
  it('preserves the submitted price and requires confirmation only for increases', () => {
    expect(sql).toContain('original_total_points integer')
    expect(sql).toContain("old.status <> 'pending'")
    expect(sql).toContain('PRICE_RECONFIRMATION_REQUIRED')
    expect(sql).toContain('v_charge_total > v_requested_total')
    expect(sql).toContain("status = 'member_confirmed'")
    expect(sql).toContain('price_frozen_at = v_now')
  })

  it('isolates active reviews by tenant and makes commands retry-safe', () => {
    expect(sql).toContain('foreign key (guild_id, order_id)')
    expect(sql).toContain("where status in ('awaiting_member', 'member_confirmed')")
    expect(sql).toContain('unique (guild_id, idempotency_key)')
    expect(sql).toContain("'replayed', true")
  })

  it('records exceptional recovery operations and blocks untrusted callers', () => {
    expect(sql).toContain('create table if not exists public.shop_recovery_receipts')
    expect(sql).toContain('execute_shop_baseline_recovery')
    expect(sql).toContain('execute_shop_inventory_reset_recovery')
    for (const signature of [
      'propose_shop_order_price_review(uuid, uuid, text, integer, text, uuid)',
      'confirm_shop_order_price_review(uuid, uuid, text, uuid)',
      'execute_shop_baseline_recovery(uuid, timestamptz, timestamptz, jsonb, integer, integer, text, text, text, uuid)',
      'execute_shop_inventory_reset_recovery(uuid, text, text, uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated`)
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
    }
    expect(sql).toContain(
      'revoke all on function public.guard_shop_order_price_snapshot() from public, anon, authenticated',
    )
  })
})
