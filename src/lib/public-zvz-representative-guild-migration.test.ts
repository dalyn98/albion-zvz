import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/391_public_zvz_representative_guild.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ representative guild migration', () => {
  it('uses battle-time alliance evidence and the exact ranking scope', () => {
    expect(migration).toContain('get_public_zvz_v2_representative_guilds')
    expect(migration).toMatch(/guild\.alliance_albion_id = alliance\.alliance_albion_id/i)
    expect(migration).toContain("p_scope = 'overall'")
    expect(migration).toContain('evidence.opponent_side_team_size')
    expect(migration).toMatch(/least\([\s\S]*\) \* 4 >= greatest\(/i)
  })

  it('selects proportional participation first and kills as the tie-breaker', () => {
    expect(migration).toContain('sum(guild.battle_credit)::numeric as equivalent_battles')
    expect(migration).toMatch(
      /order by\s+contribution\.equivalent_battles desc,\s+contribution\.kills desc/i,
    )
    expect(migration).toContain('where ranked.contribution_rank = 1')
  })

  it('keeps the read RPC service-role-only', () => {
    expect(migration).toMatch(
      /revoke all on function public\.get_public_zvz_v2_representative_guilds[\s\S]*from public, anon, authenticated/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.get_public_zvz_v2_representative_guilds[\s\S]*to service_role/i,
    )
  })
})
