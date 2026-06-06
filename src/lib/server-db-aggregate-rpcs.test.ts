import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/185_server_db_aggregate_rpcs.sql'),
  'utf8',
)

const liveStatsSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/186_disable_shadow_dependency_for_live_battle_stats.sql'),
  'utf8',
)

const appShellAggregateSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/196_app_shell_aggregate_rpcs.sql'),
  'utf8',
)

const memberPendingCountSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/197_member_pending_count_rpc.sql'),
  'utf8',
)

describe('server/db aggregate RPC migrations', () => {
  it('keeps siphon balances tenant scoped and service-role only', () => {
    expect(sql).toMatch(/create or replace function public\.get_siphon_balances/i)
    expect(sql).toMatch(/set search_path = public/i)
    expect(sql).toMatch(/where sl\.guild_id = p_guild_id/i)
    expect(sql).toMatch(/group by sl\.player/i)
    expect(sql).toMatch(/grant execute on function public\.get_siphon_balances\(uuid, timestamptz\) to service_role/i)
  })

  it('keeps battle rollup tenant scoped and applies the low-engagement cut in SQL', () => {
    expect(sql).toMatch(/create or replace function public\.guild_battle_rollup/i)
    expect(sql).toMatch(/where tbr\.guild_id = p_guild_id/i)
    expect(sql).toMatch(/p_bundle_splits/i)
    expect(sql).toMatch(/\(e\.home_kills \+ e\.home_deaths\) >= \(e\.home_team_size \* 0\.1\)/i)
    expect(sql).toMatch(/grant execute on function public\.guild_battle_rollup\(uuid, timestamptz, boolean\) to service_role/i)
  })

  it('keeps top rivals scoped to one guild', () => {
    expect(sql).toMatch(/create or replace function public\.guild_top_rivals/i)
    expect(sql).toMatch(/where tbr\.guild_id = p_guild_id/i)
    expect(sql).toMatch(/and tbr\.is_high_engagement = true/i)
    expect(sql).toMatch(/grant execute on function public\.guild_top_rivals\(uuid, timestamptz, integer\) to service_role/i)
  })

  it('keeps member leaderboard rollups scoped and battle-window filtered', () => {
    expect(liveStatsSql).toMatch(/create or replace function public\.member_leaderboard_rollups/i)
    expect(liveStatsSql).toMatch(/where tbr\.guild_id = p_guild_id/i)
    expect(liveStatsSql).toMatch(/where ke\.guild_id = p_guild_id/i)
    expect(liveStatsSql).toMatch(/ke\.discord_id is not null/i)
    expect(liveStatsSql).toMatch(/ke\.battle_id = kt\.albion_battle_id/i)
    expect(liveStatsSql).toMatch(/jsonb_each\(t\.raw_battle->'players'\)/i)
    expect(liveStatsSql).not.toContain('battle_participant_snapshots')
    expect(liveStatsSql).toMatch(/grant execute on function public\.member_leaderboard_rollups\(uuid, timestamptz, boolean\) to service_role/i)
  })

  it('keeps member siphon account aggregation tenant scoped and service-role only', () => {
    expect(appShellAggregateSql).toMatch(/create or replace function public\.get_member_siphon_account/i)
    expect(appShellAggregateSql).toMatch(/set search_path = public/i)
    expect(appShellAggregateSql).toMatch(/where sl\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/and sl\.player = p_player/i)
    expect(appShellAggregateSql).toMatch(/p_operating_start is null or sl\.logged_at >= p_operating_start/i)
    expect(appShellAggregateSql).toMatch(/grant execute on function public\.get_member_siphon_account\(uuid, text, timestamptz, integer\) to service_role/i)
  })

  it('keeps admin pending badge counts tenant scoped and service-role only', () => {
    expect(appShellAggregateSql).toMatch(/create or replace function public\.admin_pending_badge_counts/i)
    expect(appShellAggregateSql).toMatch(/where rr\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/where er\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/where dr\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/where so\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/where epr\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/where ct\.guild_id = p_guild_id/i)
    expect(appShellAggregateSql).toMatch(/grant execute on function public\.admin_pending_badge_counts\(uuid\) to service_role/i)
  })

  it('keeps member pending counts scoped to one tenant and member', () => {
    expect(memberPendingCountSql).toMatch(/create or replace function public\.member_pending_request_counts/i)
    expect(memberPendingCountSql).toMatch(/set search_path = public/i)
    expect(memberPendingCountSql).toMatch(/where rr\.guild_id = p_guild_id/i)
    expect(memberPendingCountSql).toMatch(/and rr\.discord_id = p_discord_id/i)
    expect(memberPendingCountSql).toMatch(/where er\.guild_id = p_guild_id/i)
    expect(memberPendingCountSql).toMatch(/and er\.discord_id = p_discord_id/i)
    expect(memberPendingCountSql).toMatch(/where dr\.guild_id = p_guild_id/i)
    expect(memberPendingCountSql).toMatch(/and dr\.discord_id = p_discord_id/i)
    expect(memberPendingCountSql).toMatch(/grant execute on function public\.member_pending_request_counts\(uuid, text\) to service_role/i)
  })
})
