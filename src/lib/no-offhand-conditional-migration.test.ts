import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '247_no_offhand_conditional_option.sql'),
  'utf8',
)

describe('no-offhand conditional option migration', () => {
  it('lets assign_slot accept an omitted offhand pick when conditional options allow none', () => {
    expect(migrationSql).toMatch(/__NO_OFFHAND__/)
    expect(migrationSql).toMatch(/v_allows_no_offhand/)
    expect(migrationSql).toMatch(/security\s+definer\s+set\s+search_path\s*=\s*public/i)
    expect(migrationSql).toMatch(/if\s+not\s+v_allows_no_offhand\s+then[\s\S]*raise exception 'GEAR_CHOICE_REQUIRED:%', v_k/i)
    expect(migrationSql).toMatch(/assigned_offhand_name[\s\S]*v_no_offhand_selected[\s\S]*null/i)
    expect(migrationSql).toMatch(/assigned_offhand_id[\s\S]*v_no_offhand_selected[\s\S]*null/i)
  })
})
