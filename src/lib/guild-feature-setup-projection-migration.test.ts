import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/348_preserve_feature_setup_required_projection.sql'),
  'utf8',
)

describe('migration 348 setup-required legacy projection', () => {
  it('preserves setup_required for supply, tactics, and public profile false projections', () => {
    expect(sql).toContain("v_feature_key := 'supply'")
    expect(sql).toContain("v_feature_key := 'tactics'")
    expect(sql).toContain("v_feature_key := 'public_guild_profile'")
    expect(sql.match(/v_current_state = 'setup_required'/g)).toHaveLength(3)
  })

  it('keeps explicit false projections disabled outside setup mode', () => {
    expect(sql).toMatch(
      /when new\.value = 'true' then 'enabled'[\s\S]*when v_current_state = 'setup_required' then 'setup_required'[\s\S]*else 'disabled'/i,
    )
  })

  it('keeps the trigger helper private', () => {
    expect(sql).toMatch(
      /revoke all on function public\.sync_legacy_setting_to_guild_feature_state\(\)[\s\S]*from public, anon, authenticated, service_role/i,
    )
  })
})
