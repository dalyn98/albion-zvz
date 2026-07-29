import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  new URL(
    '../../supabase/migrations/308_member_achievement_and_visibility_schema.sql',
    import.meta.url,
  ),
  'utf8',
)
const evaluatorSql = readFileSync(
  new URL(
    '../../supabase/migrations/309_member_achievement_evaluator.sql',
    import.meta.url,
  ),
  'utf8',
)
const backfillSql = readFileSync(
  new URL(
    '../../supabase/migrations/310_member_achievement_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)
const publicActivitySource = readFileSync(
  new URL('./guild-profile-activity.ts', import.meta.url),
  'utf8',
)

describe('member achievement and observed weapon migration contract', () => {
  it('keeps public achievement visibility as a separate, private-by-default consent', () => {
    expect(schemaSql).toMatch(
      /public_leaderboard_enabled boolean not null default false/i,
    )
    expect(schemaSql).toMatch(
      /check\s*\(\s*not public_leaderboard_enabled or public_activity_enabled\s*\)/i,
    )
    expect(publicActivitySource).toMatch(
      /\.eq\('public_activity_enabled', true\)[\s\S]*\.eq\('public_leaderboard_enabled', true\)/,
    )
  })

  it('persists immutable, versioned, tenant-scoped evidence records', () => {
    expect(schemaSql).toMatch(
      /create table if not exists public\.member_achievements/i,
    )
    expect(schemaSql).toMatch(
      /guild_id uuid not null references public\.tenants\(id\) on delete cascade/i,
    )
    expect(schemaSql).toMatch(/definition_version integer not null/i)
    expect(schemaSql).toMatch(/evidence_id text not null/i)
    expect(schemaSql).toMatch(/earned_at timestamptz not null/i)
    expect(schemaSql).toMatch(
      /unique\s*\(\s*guild_id\s*,\s*discord_id\s*,\s*achievement_key\s*,\s*evidence_id\s*\)/i,
    )
    expect(schemaSql).toMatch(
      /alter table public\.member_achievements enable row level security/i,
    )
    expect(schemaSql).toMatch(
      /revoke all on public\.member_achievements from service_role/i,
    )
    expect(schemaSql).toMatch(
      /grant select, insert on public\.member_achievements to service_role/i,
    )
    expect(schemaSql).not.toMatch(
      /grant\s+[^;]*(?:update|delete)[^;]*member_achievements/i,
    )
    expect(schemaSql).not.toMatch(
      /discord_id text not null references public\.guild_avatars/i,
    )
  })

  it('fans team feats out from the official participant set and stays idempotent', () => {
    expect(evaluatorSql).toMatch(
      /from public\.guild_battle_stat_units unit[\s\S]*inner join public\.guild_battle_stat_participations participation/i,
    )
    expect(evaluatorSql).toMatch(/where unit\.guild_id = p_guild_id[\s\S]*unit\.is_engagement/i)
    expect(evaluatorSql).toContain("'team_victory'::text")
    expect(evaluatorSql).toContain("'team_large_battle'::text")
    expect(evaluatorSql).toContain("'team_outnumbered_victory'::text")
    expect(evaluatorSql).toMatch(
      /unit\.stat_unit_id::text[\s\S]*on conflict\s*\(\s*guild_id\s*,\s*discord_id\s*,\s*achievement_key\s*,\s*evidence_id\s*\)\s*do nothing/i,
    )
    expect(evaluatorSql).toMatch(
      /from public\.guild_battle_stat_events event[\s\S]*event\.role = 'killer'/i,
    )
    expect(evaluatorSql).toMatch(
      /event\.role = 'victim'[\s\S]*no_official_victim_event_observed/i,
    )
  })

  it('does not couple achievements to money, supply, permissions, or compliance', () => {
    for (const forbidden of [
      'point_ledger',
      'regear_requests',
      'inventory_items',
      'shop_orders',
      'permission_role_grants',
      'permission_user_overrides',
      'alliance_content',
    ]) {
      expect(evaluatorSql.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('uses one shared observed weapon family and one member/category/battle fact', () => {
    expect(schemaSql).toMatch(
      /create or replace function public\.resolve_observed_weapon_category/i,
    )
    expect(evaluatorSql).toMatch(
      /public\.resolve_observed_weapon_category\(weapon\.mainhand_type\)/i,
    )
    expect(evaluatorSql).toMatch(
      /group by\s+categorized\.albion_player_id,\s+categorized\.category,\s+categorized\.battle_key/i,
    )
    expect(evaluatorSql).toMatch(/observation_count integer,\s*sample_count integer/i)
  })

  it('keeps the rollback RPC and exposes a bounded, resumable evaluator backfill', () => {
    expect(evaluatorSql).not.toMatch(
      /drop function if exists public\.member_ranking_counts\(uuid\)/i,
    )
    expect(backfillSql).toMatch(
      /create or replace function public\.backfill_member_achievements_batch/i,
    )
    expect(backfillSql).toContain('p_after_guild_id uuid default null')
    expect(backfillSql).toContain('p_limit integer default 10')
    expect(backfillSql).toContain('p_limit not between 1 and 25')
    expect(backfillSql).toContain('public.evaluate_member_achievements(v_tenant.id)')
    expect(backfillSql).toContain('to service_role')
    expect(backfillSql).not.toMatch(/insert into public\.member_achievements/i)
    expect(backfillSql).not.toMatch(
      /^select public\.evaluate_member_achievements\(tenant\.id\)/m,
    )
  })

  it('expands exactly the two permission validators for the dedicated capability', () => {
    expect(schemaSql).toContain('68719476735')
    expect(schemaSql).toMatch(
      /procedure\.proname in\s*\(\s*'apply_permission_role_grant',\s*'apply_permission_user_override'\s*\)/i,
    )
    expect(schemaSql).toMatch(/if v_updated <> 2 then/i)
  })
})
