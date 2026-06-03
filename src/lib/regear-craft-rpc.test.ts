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
      'revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) from public;',
    )
    expect(sql).toContain(
      'revoke all on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) from anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.approve_regear_as_crafted(uuid, text, text, uuid, integer) to service_role;',
    )
  })
})
