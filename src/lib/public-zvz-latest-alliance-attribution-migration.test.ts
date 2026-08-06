import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rules = readFileSync(
  join(
    root,
    'supabase/migrations/404_public_zvz_latest_alliance_attribution.sql',
  ),
  'utf8',
)
const backfill = readFileSync(
  join(
    root,
    'supabase/migrations/405_public_zvz_latest_alliance_backfill.sql',
  ),
  'utf8',
)

describe('latest alliance ranking attribution migration', () => {
  it('resolves the latest guild alliance without overwriting battle-time facts', () => {
    expect(rules).toContain('get_public_zvz_v2_latest_guild_alliances')
    expect(rules).toMatch(
      /order by[\s\S]*evidence\.entity_albion_id[\s\S]*evidence\.battle_started_at desc[\s\S]*evidence\.engagement_id desc/i,
    )
    expect(rules).toContain('battle_alliance_albion_id')
    expect(rules).toContain('battle_alliance_name')
  })

  it('requires two current-alliance guilds and aggregates their proportional evidence', () => {
    expect(rules).toMatch(
      /membership\.alliance_albion_id[\s\S]*having count\(distinct evidence\.entity_albion_id\) >= 2/i,
    )
    expect(rules).toMatch(
      /force\.battle_credit[\s\S]*members\.observed_team_size[\s\S]*total\.observed_team_size/i,
    )
    expect(rules).toContain('sum(evidence.own_team_size)')
    expect(rules).toContain('member_guilds')
  })

  it('rebuilds derived snapshots separately from the function migration', () => {
    expect(backfill).toContain('refresh_public_zvz_v2_season_snapshots')
    expect(backfill).toContain('true')
    expect(backfill).not.toContain('public_zvz_entity_engagement_evidence')
  })
})
