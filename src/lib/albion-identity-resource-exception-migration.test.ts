import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  new URL('../../supabase/migrations/417_albion_identity_resource_exceptions.sql', import.meta.url),
  'utf8',
)
const seedSql = readFileSync(
  new URL('../../supabase/migrations/418_seed_zerotooherocaller_resource_exception.sql', import.meta.url),
  'utf8',
)

describe('Albion identity resource exception migrations', () => {
  it('keeps exception identity tenant- and character-scoped behind RLS', () => {
    expect(schemaSql).toContain('primary key (guild_id, discord_id)')
    expect(schemaSql).toContain('unique (guild_id, albion_server, albion_player_id)')
    expect(schemaSql).toContain('enable row level security')
    expect(schemaSql).toContain('revoke all on public.albion_identity_resource_exceptions from anon, authenticated')
  })

  it('seeds only the explicitly requested Discord and Albion identity', () => {
    expect(seedSql).toContain("link.discord_id = '839318087542636545'")
    expect(seedSql).toContain("link.albion_player_id = 'GfH-ficCT3y5rithtesRuA'")
    expect(seedSql).toContain("lower('ZeroToHeroCaller')")
    expect(seedSql).toContain("on conflict (guild_id, discord_id) do update")
  })
})
