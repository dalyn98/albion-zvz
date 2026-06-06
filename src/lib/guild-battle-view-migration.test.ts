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
    expect(sql).toContain('has_active_diff')
    expect(sql).toContain('active_diff_types')
    expect(sql).toContain('public.battle_projection_diffs')
    expect(sql).not.toMatch(/drop\s+table\s+public\.tenant_battle_records/i)
  })

  it('adds activity classification as appended guild battle view metadata', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/207_battle_activity_classification.sql'),
      'utf8',
    )

    expect(sql).toContain('create table if not exists public.battle_activity_overrides')
    expect(sql).toContain('create or replace function public.resolve_battle_activity_kind')
    expect(sql).toContain('create or replace view public.tenant_zvz_battle_records')
    expect(sql).toContain("where public.resolve_battle_activity_kind(tbr.guild_id, tbr.battle_record_id, 'direct') = 'zvz'")
    expect(sql).toMatch(/bvp\.updated_at,\s+activity\.activity_kind,\s+activity\.activity_source,\s+activity\.activity_reason/s)
  })
})
