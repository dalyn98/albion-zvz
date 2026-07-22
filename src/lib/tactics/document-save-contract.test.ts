import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('atomic tactic document save contract', () => {
  it('ships a tenant-scoped optimistic transaction for board and all steps', () => {
    const migrationPath = 'supabase/migrations/276_tactic_document_atomic_save.sql'
    expect(existsSync(join(process.cwd(), migrationPath))).toBe(true)

    const sql = source(migrationPath).toLowerCase()
    expect(sql).toContain('create or replace function public.save_tactic_document_atomic')
    expect(sql).toContain('guild_id = p_guild_id')
    expect(sql).toContain('board_id = p_board_id')
    expect(sql).toContain('for update')
    expect(sql).toContain('tactic_version_conflict')
    expect(sql).toContain('revoke all on function public.save_tactic_document_atomic')
    expect(sql).toContain('grant execute on function public.save_tactic_document_atomic')
  })

  it('makes editor mutations flush the complete document instead of one active step', () => {
    const editor = source('src/components/tactics/TacticEditor.tsx')

    expect(editor).toContain('saveTacticDocument')
    expect(editor).toContain('persistDocument')
    expect(editor).not.toMatch(/\bsaveTacticStep\s*\(/)
    expect(editor).toMatch(/await persistDocument\(\)[\s\S]*createTacticStep/)
    expect(editor).toMatch(/await persistDocument\(\)[\s\S]*publishTacticBoard/)
  })
})
