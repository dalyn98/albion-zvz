import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('guild battle view migration', () => {
  it('creates the product read model from shadow projections without dropping legacy rows', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/195_guild_battle_views.sql'),
      'utf8',
    )

    expect(sql).toContain('create or replace view public.guild_battle_views')
    expect(sql).toContain('public.battle_view_projections')
    expect(sql).toContain('public.battle_records')
    expect(sql).toContain("home.key = 'albion_home_guild_id'")
    expect(sql).toContain('legacy_tenant_battle_record_id')
    expect(sql).not.toMatch(/drop\s+table\s+public\.tenant_battle_records/i)
  })
})
