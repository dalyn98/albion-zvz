import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectionSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/285_battle_engagement_projections.sql',
  ),
  'utf8',
)
const statsSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/286_battle_engagement_official_stats.sql',
  ),
  'utf8',
)
const sideSizeSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/293_battle_engagement_side_size.sql',
  ),
  'utf8',
)
const projectionClientSource = readFileSync(
  join(process.cwd(), 'src/lib/battle-engagement-projection-db.ts'),
  'utf8',
)

describe('battle engagement migrations', () => {
  it('publishes only stable, current source projections', () => {
    expect(projectionSql).toMatch(/last_observation_token uuid not null/i)
    expect(projectionSql).toMatch(/v_observation_count < 2/i)
    expect(projectionSql).toMatch(
      /br\.engagement_source_hash = run\.source_hash/i,
    )
    expect(projectionSql).toMatch(
      /observation\.source_hash = run\.source_hash/i,
    )
  })

  it('binds official totals to raw battle and observed event rows', () => {
    expect(projectionSql).toContain('BATTLE_ENGAGEMENT_RAW_TOTAL_MISMATCH')
    expect(projectionSql).toContain('BATTLE_ENGAGEMENT_EVENT_SOURCE_MISMATCH')
    expect(projectionSql).toContain('BATTLE_ENGAGEMENT_TOTAL_MISMATCH')
    expect(projectionSql).toContain(
      'BATTLE_ENGAGEMENT_COLLECTED_TOTAL_MISMATCH',
    )
    expect(projectionSql).toMatch(/event\.fame_is_observed/i)
  })

  it('requires 20 players on both sides and sums non-intervention opponents', () => {
    expect(sideSizeSql).toMatch(
      /add column if not exists opponent_side_team_size integer not null default 0/i,
    )
    expect(sideSizeSql).toMatch(/v_home_side_team_size < 20/i)
    expect(sideSizeSql).toMatch(/sum\(matchup\.opponent_team_size\)/i)
    expect(sideSizeSql).toMatch(/matchup\.matchup_role = ''result_eligible''/i)
    expect(sideSizeSql).toMatch(/\) < 20/i)
    expect(sideSizeSql).toContain(
      'BATTLE_ENGAGEMENT_PUBLISHER_V2_PATCH_TARGET_MISSING',
    )
    expect(sideSizeSql).toMatch(
      /create or replace function public\.publish_battle_engagement_projection_v2/i,
    )
    expect(sideSizeSql).toMatch(
      /grant execute on function public\.publish_battle_engagement_projection_v2[\s\S]*to service_role/i,
    )
    expect(projectionClientSource).toContain(
      ".rpc('publish_battle_engagement_projection_v2'",
    )
  })

  it('keeps projection tables and publisher RPC service-only', () => {
    expect(projectionSql).toMatch(
      /revoke all on public\.battle_engagement_runs from public, anon, authenticated/i,
    )
    expect(projectionSql).toMatch(
      /revoke all on function public\.publish_battle_engagement_projection[\s\S]*from public, anon, authenticated/i,
    )
    expect(projectionSql).toMatch(
      /grant execute on function public\.publish_battle_engagement_projection[\s\S]*to service_role/i,
    )
    expect(projectionSql).toMatch(
      /revoke all on public\.battle_engagement_runs from service_role/i,
    )
    expect(projectionSql).toMatch(
      /grant select\s+on public\.battle_engagement_runs to service_role/i,
    )
    expect(projectionSql).not.toMatch(
      /grant select, insert, update, delete\s+on public\.battle_engagement_runs to service_role/i,
    )
    expect(statsSql).toMatch(
      /revoke all on function public\.member_battle_participations\(uuid\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(statsSql).toMatch(
      /grant execute on function public\.member_battle_participations\(uuid\)[\s\S]*to service_role/i,
    )
    expect(statsSql).not.toMatch(
      /grant execute on function public\.(?:member_battle_participations|member_ranking_counts)[\s\S]{0,120}to authenticated/i,
    )
  })

  it('does not create a manual split or merge authority', () => {
    expect(projectionSql).not.toMatch(
      /create\s+table[\s\S]{0,120}battle_engagement_(?:split|merge|boundary)_overrides/i,
    )
    expect(projectionSql).not.toMatch(
      /create\s+(?:or\s+replace\s+)?function[\s\S]{0,120}(?:split|merge)_battle_engagement/i,
    )
  })

  it('never revives a legacy result after a projection run exists', () => {
    expect(statsSql).toMatch(
      /not exists\s*\([\s\S]*?from public\.battle_engagement_runs run[\s\S]*?run\.battle_record_id = record\.battle_record_id/i,
    )
    expect(statsSql).toMatch(
      /link\.classification = 'result_eligible'/i,
    )
  })
})
