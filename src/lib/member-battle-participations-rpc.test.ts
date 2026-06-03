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

describe('member_battle_participations RPC', () => {
  it('uses raw battle players instead of paused shadow snapshots and keeps stable ordering', () => {
    const sql = latestFunctionDefinition('member_battle_participations')

    expect(sql).toContain("jsonb_each(t.raw_battle->'players')")
    expect(sql).not.toContain('battle_participant_snapshots')
    expect(sql).toContain('order by 3 asc, 2 asc, 1 asc, 4 asc')
  })
})
