import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function allMigrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), 'utf8'))
    .join('\n')
}

function latestFunctionDefinition(functionName: string): string {
  let latest = ''
  for (const fileName of readdirSync(migrationsDir).sort()) {
    if (!fileName.endsWith('.sql')) continue
    const sql = readFileSync(join(migrationsDir, fileName), 'utf8')
    const marker = `create or replace function public.${functionName}(`
    const index = sql.lastIndexOf(marker)
    if (index === -1) continue
    const end = sql.indexOf('$$;', index)
    latest = end === -1 ? sql.slice(index) : sql.slice(index, end + 3)
  }
  expect(latest).not.toBe('')
  return latest
}

describe('shop order reservation RPCs', () => {
  it('reserves available stock when a member submits an order', () => {
    const sql = latestFunctionDefinition('submit_shop_order')

    expect(sql).toContain('stock_reserved_at')
    expect(sql).toMatch(/update\s+public\.shop_inventory[\s\S]*stock\s*=\s*stock\s*-\s*v_line\.quantity/i)
    expect(sql).toMatch(/and\s+stock\s*>=\s*v_line\.quantity/i)
    expect(sql).toMatch(/group\s+by\s+unique_name,\s*enchant/i)
    expect(sql).not.toMatch(/group\s+by\s+unique_name,\s*enchant,\s*quality/i)
    expect(sql).toContain('INSUFFICIENT_STOCK')
  })

  it('does not decrement stock again for orders already reserved at submit time', () => {
    const sql = latestFunctionDefinition('approve_shop_order')

    expect(sql).toContain('v_stock_reserved_at')
    expect(sql).toMatch(/if\s+v_stock_reserved_at\s+is\s+null\s+then[\s\S]*stock\s*=\s*stock\s*-\s*v_line\.quantity/i)
    expect(sql).toContain('total_points = v_charge_total')
    expect(sql).toContain("'shop_purchase'")
  })

  it('reconciles reserved-order delivery logs imported before approval', () => {
    const sql = latestFunctionDefinition('approve_shop_order')

    expect(sql).toContain('matched_order_items')
    expect(sql).toContain('v_match_qty')
    expect(sql).toMatch(/l\.logged_at\s*>=\s*v_stock_reserved_at/i)
    expect(sql).toMatch(/perform\s+public\.apply_shop_stock_delta[\s\S]*v_match_qty/i)
  })

  it('restores reserved stock when an order is rejected or cancelled', () => {
    const rejectSql = latestFunctionDefinition('reject_shop_order')
    const cancelSql = latestFunctionDefinition('cancel_shop_order')

    for (const sql of [rejectSql, cancelSql]) {
      expect(sql).toContain('v_stock_reserved_at')
      expect(sql).toMatch(/if\s+v_stock_reserved_at\s+is\s+not\s+null\s+then[\s\S]*stock\s*=\s*public\.shop_inventory\.stock\s*\+\s*v_line\.quantity/i)
    }
  })

  it('stores raw chest-log quantities separately from inventory-applied quantities', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('applied_quantity')
    expect(sql).toContain('ignored_quantity')
    expect(sql).toContain('ignored_reason')
    expect(sql).toContain('matched_order_items')
    expect(sql).toContain('shop_order_fulfillment')
  })

  it('rebuilds shop inventory from applied chest-log quantity, not raw quantity', () => {
    const sql = latestFunctionDefinition('rebuild_shop_inventory_from_chest_logs')

    expect(sql).toContain('coalesce(l.applied_quantity, l.quantity)::int as delta')
    expect(sql).not.toContain('l.quantity::int as delta')
  })

  it('uses a tenant-scoped quality-agnostic unique key for shop inventory', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('on public.shop_inventory (guild_id, unique_name, enchant)')
    expect(sql).toContain('quality is raw-log metadata; shop stock is keyed by guild_id, unique_name, enchant')
  })
})
