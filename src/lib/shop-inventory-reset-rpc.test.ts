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

describe('shop inventory reset RPC', () => {
  it('supersedes only the current guild confirmed baseline during full reset', () => {
    const sql = latestFunctionDefinition('reset_shop_inventory_all')
    const baselineUpdate = sql.match(
      /update\s+public\.shop_baselines[\s\S]*?get\s+diagnostics\s+v_baselines_superseded\s*=\s*row_count;/i,
    )?.[0]

    expect(baselineUpdate).toContain("set status = 'superseded'")
    expect(baselineUpdate).toContain('where guild_id = p_guild_id')
    expect(baselineUpdate).toContain("and status = 'confirmed'")
    expect(sql).toContain("'baselines_superseded', v_baselines_superseded")
  })
})
