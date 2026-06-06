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

function latestMigrationWithFunction(functionName: string): string {
  let latest = ''
  for (const fileName of readdirSync(migrationsDir).sort()) {
    if (!fileName.endsWith('.sql')) continue
    const sql = readFileSync(join(migrationsDir, fileName), 'utf8')
    if (!sql.includes(`create or replace function public.${functionName}(`)) continue
    latest = sql
  }
  expect(latest).not.toBe('')
  return latest
}

describe('crafted regear RPC tenant scope', () => {
  it('scopes approve_regear_as_crafted task idempotency lookup by guild', () => {
    const sql = latestFunctionDefinition('approve_regear_as_crafted')
    const taskLookup = sql.match(
      /select\s+id\s+into\s+v_existing_task[\s\S]*?from\s+craft_tasks[\s\S]*?;/i,
    )?.[0]

    expect(taskLookup).toContain('where regear_request_id = p_id')
    expect(taskLookup).toContain('and guild_id = p_guild_id')
  })

  it('keeps approve_regear_as_crafted security-definer execution constrained to service role', () => {
    const sql = latestMigrationWithFunction('approve_regear_as_crafted')
    const functionDefinition = latestFunctionDefinition('approve_regear_as_crafted')

    expect(functionDefinition).toContain('security definer')
    expect(functionDefinition).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from public;',
    )
    expect(sql).toContain(
      'revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) from anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer, text[]) to service_role;',
    )
  })

  it('persists requested craft slots when auto regear creates a crafted request', () => {
    const sql = latestFunctionDefinition('create_auto_regear_request')

    expect(sql).toContain('p_craft_requested_slots text[]')
    expect(sql).toContain('craft_requested_slots')
    expect(sql).toContain('to_jsonb(p_craft_requested_slots)')
  })

  it('persists the final included craft slots when enqueuing crafted regear', () => {
    const sql = latestFunctionDefinition('approve_regear_as_crafted')

    expect(sql).toContain('p_included_slots text[]')
    expect(sql).toContain('craft_included_slots')
    expect(sql).toContain('to_jsonb(v_included_slots)')
  })

  it('persists the final included craft slots when approving from stock', () => {
    const sql = latestFunctionDefinition('approve_regear_from_stock')

    expect(sql).toContain('p_included_slots text[]')
    expect(sql).toContain('craft_included_slots')
    expect(sql).toContain('to_jsonb(v_included_slots)')
  })

  it('does not credit crafter reimbursement during delivery', () => {
    const sql = latestFunctionDefinition('deliver_craft_task')

    expect(sql).toContain("then 'pending'")
    expect(sql).not.toContain("values (p_guild_id, p_crafter_discord_id, v_reimbursement")
    expect(sql).not.toContain("'craft_reimbursement', p_task_id")
  })

  it('expires only regear craft tasks so guild-order claims are not swept', () => {
    const sql = latestFunctionDefinition('expire_craft_tasks')

    expect(sql).toContain("task_kind = 'regear'")
  })

  it('adds a service-role-only reimbursement approval RPC', () => {
    const sql = latestMigrationWithFunction('approve_craft_reimbursement')
    const functionDefinition = latestFunctionDefinition('approve_craft_reimbursement')

    expect(functionDefinition).toContain('security definer')
    expect(functionDefinition).toContain('set search_path = public')
    expect(functionDefinition).toContain('returns integer')
    expect(functionDefinition).toContain("insert into point_ledger")
    expect(functionDefinition).toContain("'craft_reimbursement'")
    expect(sql).toContain(
      'revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from public;',
    )
    expect(sql).toContain(
      'revoke all on function public.approve_craft_reimbursement(uuid, uuid, text, text) from anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.approve_craft_reimbursement(uuid, uuid, text, text) to service_role;',
    )
  })

  it('allows pending crafter reimbursement approval after pickup or expiry', () => {
    const functionDefinition = latestFunctionDefinition('approve_craft_reimbursement')

    expect(functionDefinition).toMatch(
      /status\s+in\s*\(\s*'delivered'\s*,\s*'collected'\s*,\s*'expired'\s*\)/i,
    )
    expect(functionDefinition).not.toContain("and status = 'delivered'")
  })

  it('adds service-role-only adjusted approval and rejection RPCs for reimbursements', () => {
    const adjustedSql = latestMigrationWithFunction('approve_craft_reimbursement_adjusted')
    const adjustedFunction = latestFunctionDefinition('approve_craft_reimbursement_adjusted')
    const rejectSql = latestMigrationWithFunction('reject_craft_reimbursement')
    const rejectFunction = latestFunctionDefinition('reject_craft_reimbursement')

    expect(adjustedFunction).toContain('p_reimbursement_silver integer')
    expect(adjustedFunction).toContain('security definer')
    expect(adjustedFunction).toContain("reimbursement_status = 'approved'")
    expect(adjustedFunction).toContain("insert into point_ledger")
    expect(adjustedFunction).toContain("'craft_reimbursement'")
    expect(adjustedSql).toContain(
      'grant execute on function public.approve_craft_reimbursement_adjusted(uuid, uuid, text, text, integer) to service_role;',
    )

    expect(rejectFunction).toContain('p_reject_reason text')
    expect(rejectFunction).toContain('security definer')
    expect(rejectFunction).toContain("reimbursement_status = 'rejected'")
    expect(rejectFunction).not.toContain('insert into point_ledger')
    expect(rejectSql).toContain(
      'grant execute on function public.reject_craft_reimbursement(uuid, uuid, text, text, text) to service_role;',
    )
  })
})
