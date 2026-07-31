import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '334_atomic_supply_fulfillment.sql'),
  'utf8',
)

describe('atomic supply fulfillment migration', () => {
  it('separates fulfillment, custody, finished inventory, settlement, and outbox records', () => {
    for (const table of [
      'supply_fulfillments',
      'supply_fulfillment_events',
      'guild_inventory_movements',
      'supply_outside_stock_fulfillments',
      'supply_settlement_batches',
      'supply_settlement_items',
      'domain_outbox',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`)
      expect(sql).toContain(`alter table public.${table} enable row level security`)
    }
    expect(sql).toMatch(
      /supply_fulfillments_craft_task_fkey[\s\S]*foreign key \(guild_id, craft_task_id\)[\s\S]*references public\.craft_tasks\(guild_id, id\)/i,
    )
    expect(sql).toMatch(
      /supply_outside_stock_fulfillments_task_fkey[\s\S]*foreign key \(guild_id, task_id\)[\s\S]*references public\.craft_tasks\(guild_id, id\)/i,
    )
  })

  it('freezes material reimbursement and craft fee independently at claim time', () => {
    expect(sql).toMatch(/p_material_source not in \('guild_stock', 'crafter_purchase'\)/i)
    expect(sql).toMatch(/p_craft_fee_mode not in \('none', 'configured'\)/i)
    expect(sql).toMatch(
      /if p_material_source = 'crafter_purchase' then[\s\S]*v_material_reimbursement := v_quoted_material::integer/i,
    )
    expect(sql).toMatch(
      /if p_craft_fee_mode = 'configured' then[\s\S]*v_craft_fee := floor\(v_quoted_material \* p_craft_fee_pct \/ 100\.0\)::integer/i,
    )
    expect(sql).toContain("'settlementTotalSilver', v_total")
  })

  it('executes delivery, stock movement, settlement entitlement, audit, and outbox in one function', () => {
    const delivery = sql.match(
      /create or replace function public\.execute_supply_craft_delivery\([\s\S]*?\nend;\n\$\$;/i,
    )?.[0]
    expect(delivery).toBeDefined()
    expect(delivery).toContain("set status = 'delivered'")
    expect(delivery).toContain("'craft_delivery'")
    expect(delivery).toContain('supply_outside_stock_fulfillments')
    expect(delivery).toContain('supply_settlement_items')
    expect(delivery).toContain('admin_audit_log')
    expect(delivery).toContain('domain_outbox')
    expect(delivery).toContain('application_command_runs')
    const legacyDelivery = sql.match(
      /create or replace function public\.deliver_craft_task\([\s\S]*?\nend;\n\$\$;/i,
    )?.[0]
    expect(legacyDelivery).toContain('USE_EXECUTE_SUPPLY_CRAFT_DELIVERY')
    expect(legacyDelivery).not.toContain('update craft_tasks')
  })

  it('never releases custody from the overdue sweep', () => {
    const expiry = sql.match(
      /create or replace function public\.expire_craft_tasks\(\)[\s\S]*?\nend;\n\$\$;/i,
    )?.[0]
    expect(expiry).toBeDefined()
    expect(expiry).toContain("set status = 'receipt_overdue'")
    expect(expiry).not.toContain('update public.craft_tasks')
    expect(expiry).not.toContain('box_number = null')
  })

  it('keeps box moves custody-only and makes explicit returns retry-safe', () => {
    const move = sql.match(
      /create or replace function public\.move_supply_craft_box\([\s\S]*?\nend;\n\$\$;/i,
    )?.[0]
    expect(move).toBeDefined()
    expect(move).toContain('set box_number = p_box_number')
    expect(move).not.toContain("set status = 'ready_for_pickup'")
    expect(move).not.toContain('receipt_overdue_at = null')

    const returned = sql.match(
      /create or replace function public\.return_unclaimed_supply_craft\([\s\S]*?\nend;\n\$\$;/i,
    )?.[0]
    expect(returned).toBeDefined()
    expect(returned).toContain("if v_fulfillment.status = 'returned_unclaimed' then")
    expect(returned).toContain("'replayed', true")
    expect(returned).toContain("'unclaimed_return'")
  })

  it('locks regear tasks before fulfillments across custody mutations', () => {
    for (const fn of [
      'release_supply_craft_task',
      'collect_supply_fulfillment',
      'move_supply_craft_box',
      'return_unclaimed_supply_craft',
    ]) {
      const definition = sql.match(
        new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\nend;\\n\\$\\$;`, 'i'),
      )?.[0]
      expect(definition).toBeDefined()
      expect(definition).toContain("task.task_kind = 'regear'")
      expect(definition!.indexOf('select task.*')).toBeLessThan(
        definition!.indexOf('select fulfillment.*'),
      )
    }
  })

  it('preserves adjusted legacy totals while deriving a constraint-safe component split', () => {
    expect(sql).toMatch(
      /greatest\(coalesce\(task\.reimbursement_silver, 0\), 0\)::integer as total_silver/i,
    )
    expect(sql).toContain('legacy_amount.total_silver - legacy_amount.material_silver')
    expect(sql).toContain("'legacyReimbursementSilver', task.reimbursement_silver")
  })

  it('keeps direct tables private and grants only service-role command wrappers', () => {
    expect(sql).toMatch(
      /revoke all on public\.supply_fulfillments,[\s\S]*from public, anon, authenticated/i,
    )
    for (const fn of [
      'claim_supply_craft_task',
      'release_supply_craft_task',
      'execute_supply_craft_delivery',
      'collect_supply_fulfillment',
      'move_supply_craft_box',
      'return_unclaimed_supply_craft',
      'pay_supply_settlement_batch',
    ]) {
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(`, 'i'))
    }
    for (const triggerFn of [
      'sync_supply_fulfillment_from_craft_task',
      'record_finished_inventory_projection_movement',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${triggerFn}\\(\\)[\\s\\S]*from public, anon, authenticated, service_role`,
          'i',
        ),
      )
    }
  })
})
