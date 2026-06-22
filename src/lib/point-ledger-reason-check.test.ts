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

describe('point ledger reason check', () => {
  it('allows every ledger reason currently used by approval and payout flows', () => {
    const allowedReasons = latestPointLedgerReasonCheck()

    expect([...allowedReasons].sort()).toEqual([
      'admin_adjust',
      'craft_order_payout',
      'craft_reimbursement',
      'donation_approved',
      'event_payout_approved',
      'exchange_paid',
      'member_trade_purchase',
      'member_trade_sale',
      'regear_approved',
      'shop_purchase',
      'transfer_in',
      'transfer_out',
    ])
  })

  it('allows the shop purchase reason used by approve_shop_order', () => {
    const allowedReasons = latestPointLedgerReasonCheck()
    const approveShopOrderSql = latestFunctionDefinition('approve_shop_order')

    expect(approveShopOrderSql).toContain("'shop_purchase'")
    expect(allowedReasons).toContain('shop_purchase')
  })
})
