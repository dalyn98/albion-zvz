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

describe('shop manual stock adjustment RPCs', () => {
  it('creates a tenant-scoped manual stock adjustment ledger', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('create table if not exists public.shop_inventory_adjustments')
    expect(sql).toContain('guild_id uuid not null')
    expect(sql).toContain('before_stock integer not null')
    expect(sql).toContain('after_stock integer not null')
    expect(sql).toContain('alter table public.shop_inventory_adjustments enable row level security')
    expect(sql).toContain('revoke all on public.shop_inventory_adjustments from anon, authenticated')
  })

  it('sets stock atomically while recording the before and after SKU state', () => {
    const sql = latestFunctionDefinition('set_shop_inventory_stock')

    expect(sql).toContain('for update')
    expect(sql).toContain('INVENTORY_NOT_FOUND')
    expect(sql).toContain('insert into public.shop_inventory_adjustments')
    expect(sql).toContain('p_guild_id')
    expect(sql).toContain('p_inventory_id')
    expect(sql).toContain('p_admin_id')
    expect(sql).toContain('before_stock')
    expect(sql).toContain('after_stock')
  })

  it('replays manual stock adjustments after chest logs during inventory rebuild', () => {
    const sql = latestFunctionDefinition('rebuild_shop_inventory_from_chest_logs')

    expect(sql).toContain('from public.shop_inventory_adjustments a')
    expect(sql).toContain('a.after_stock')
    expect(sql).toMatch(/order\s+by\s+a\.created_at\s+asc,\s*a\.id\s+asc/i)
  })
})
