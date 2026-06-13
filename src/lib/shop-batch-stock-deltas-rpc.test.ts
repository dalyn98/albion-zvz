import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

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

describe('shop batch stock delta RPC', () => {
  it('applies JSON batch deltas by explicit array ordinality', () => {
    const sql = latestFunctionDefinition('apply_shop_stock_deltas')

    expect(sql).toMatch(/jsonb_array_elements\s*\(\s*p_deltas\s*\)\s+with\s+ordinality/i)
    expect(sql).toMatch(/order\s+by\s+delta_row\.ordinality/i)
    expect(sql).toMatch(/perform\s+public\.apply_shop_stock_delta/i)
  })

  it('keeps automatic rebuild away from current-epoch active reservations', () => {
    const migrationSql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '224_ordered_shop_stock_deltas_rebuild.sql'),
      'utf8',
    )

    expect(migrationSql).toContain("o.status in ('pending', 'approved')")
    expect(migrationSql).toContain('o.stock_reserved_at is not null')
    expect(migrationSql).toContain("shop_order_fulfillment_cutoff_at")
    expect(migrationSql).toMatch(/case\s+when\s+cutoff\.value\s+is\s+null\s+then\s+true/i)
    expect(migrationSql).toMatch(/o\.stock_reserved_at\s+>=\s+cutoff\.value::timestamptz/i)
    expect(migrationSql).toContain('rebuild_shop_inventory_from_chest_logs')
  })
})
