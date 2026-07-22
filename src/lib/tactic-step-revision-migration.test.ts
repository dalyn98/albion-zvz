import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/279_tactic_step_revision.sql',
)

describe('tactic step revision migration', () => {
  it('ships the migration that makes step membership part of the board revision', () => {
    expect(existsSync(migrationPath)).toBe(true)
  })

  it('bumps the guild-scoped board revision after step insert and delete', () => {
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/create or replace function public\.touch_tactic_board_step_revision/i)
    expect(sql).toMatch(/where id\s*=\s*v_board_id[\s\S]*guild_id\s*=\s*v_guild_id/i)
    expect(sql).toMatch(/greatest\([\s\S]*updated_at\s*\+\s*interval '1 millisecond'/i)
    expect(sql).toMatch(/after insert on public\.tactic_steps/i)
    expect(sql).toMatch(/after delete on public\.tactic_steps/i)
    expect(sql).not.toMatch(/after update on public\.tactic_steps/i)
  })
})
