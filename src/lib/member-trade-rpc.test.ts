import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function migrationSqlFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()
    .map((fileName) => join(migrationsDir, fileName))
}

function latestPointLedgerReasonCheck(): Set<string> {
  let latest = ''
  for (const filePath of migrationSqlFiles()) {
    const sql = readFileSync(filePath, 'utf8')
    const matches = [...sql.matchAll(/add\s+constraint\s+point_ledger_reason_check[\s\S]*?check\s*\(\s*reason\s+in\s*\(([\s\S]*?)\)\s*\)/gi)]
    const lastMatch = matches.at(-1)
    if (lastMatch) latest = lastMatch[1]
  }

  expect(latest).not.toBe('')
  return new Set([...latest.matchAll(/'([^']+)'/g)].map((match) => match[1]))
}

function latestFunctionDefinition(functionName: string): string {
  let latest = ''
  for (const filePath of migrationSqlFiles()) {
    const sql = readFileSync(filePath, 'utf8')
    const marker = `create or replace function public.${functionName}(`
    const index = sql.lastIndexOf(marker)
    if (index === -1) continue
    const end = sql.indexOf('$$;', index)
    latest = end === -1 ? sql.slice(index) : sql.slice(index, end + 3)
  }
  expect(latest).not.toBe('')
  return latest
}

describe('member trade migration contract', () => {
  it('adds member-trade ledger reasons used when escrow is released', () => {
    const allowedReasons = latestPointLedgerReasonCheck()

    expect(allowedReasons).toContain('member_trade_purchase')
    expect(allowedReasons).toContain('member_trade_sale')
  })

  it('keeps point escrow and member trade RPCs tenant-scoped', () => {
    const buySql = latestFunctionDefinition('buy_member_trade_listing_items')
    const completeSql = latestFunctionDefinition('complete_member_trade_order')

    expect(buySql).toContain('p_guild_id')
    expect(buySql).toMatch(/guild_id\s*=\s*p_guild_id/i)
    expect(buySql).toContain('point_escrows')
    expect(buySql).toContain('member_trade_listing_items')
    expect(buySql).toContain('member_trade_order_items')
    expect(completeSql).toContain('p_guild_id')
    expect(completeSql).toMatch(/guild_id\s*=\s*p_guild_id/i)
    expect(completeSql).toContain("'member_trade_purchase'")
    expect(completeSql).toContain("'member_trade_sale'")
  })

  it('defines RLS-protected member trade tables', () => {
    const sql = migrationSqlFiles()
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n')

    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.member_trade_listings/i)
    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.member_trade_listing_items/i)
    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.member_trade_orders/i)
    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.member_trade_order_items/i)
    expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.point_escrows/i)
    expect(sql).toMatch(/alter\s+table\s+public\.member_trade_listings\s+enable\s+row\s+level\s+security/i)
    expect(sql).toMatch(/alter\s+table\s+public\.member_trade_listing_items\s+enable\s+row\s+level\s+security/i)
    expect(sql).toMatch(/alter\s+table\s+public\.member_trade_orders\s+enable\s+row\s+level\s+security/i)
    expect(sql).toMatch(/alter\s+table\s+public\.member_trade_order_items\s+enable\s+row\s+level\s+security/i)
    expect(sql).toMatch(/alter\s+table\s+public\.point_escrows\s+enable\s+row\s+level\s+security/i)
  })
})
