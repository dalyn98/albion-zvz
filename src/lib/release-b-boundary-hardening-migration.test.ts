import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/341_release_b_boundary_hardening.sql'),
  'utf8',
)
const recoverySql = readFileSync(
  join(process.cwd(), 'supabase/migrations/342_release_exchange_holds_during_recovery.sql'),
  'utf8',
)

describe('Release B boundary hardening migration', () => {
  it('fails closed for legacy pending exchange writes without weakening old rows', () => {
    expect(sql).toContain('EXCHANGE_SUBMIT_RPC_REQUIRED')
    expect(sql).toContain('EXCHANGE_PENDING_HOLD_REQUIRED')
    expect(sql).toContain("old.hold_status = 'legacy_unheld'")
    expect(sql).toContain('new.silver = old.silver')
    expect(sql).toContain('exchange_requests_pending_hold_contract_check')
  })

  it('keeps the guard and shop trigger internals out of every API role', () => {
    expect(sql).toContain(
      'revoke all on function public.guard_exchange_request_hold_contract()\n  from public, anon, authenticated, service_role',
    )
    expect(sql).toContain(
      'revoke all on function public.guard_shop_order_price_snapshot()\n  from service_role',
    )
    expect(sql).toContain(
      'revoke all on function public.supersede_shop_order_price_review_on_close()\n  from service_role',
    )
  })

  it('releases holds when a compatible recovery command rejects a pending request', () => {
    expect(recoverySql).toContain("old.status = 'pending'")
    expect(recoverySql).toContain("new.status in ('rejected', 'cancelled')")
    expect(recoverySql).toContain("new.hold_status := 'released'")
    expect(recoverySql).toContain('new.held_points := 0')
    expect(recoverySql).toContain('EXCHANGE_APPROVAL_HOLD_REQUIRED')
  })
})
