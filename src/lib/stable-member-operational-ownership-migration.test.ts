import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/358_stable_member_operational_ownership.sql',
  ),
  'utf8',
)

describe('migration 358 stable member operational ownership', () => {
  it('expands core economy, trade, craft, and Menhera owners without deleting compatibility keys', () => {
    for (const table of [
      'point_ledger',
      'exchange_requests',
      'donation_requests',
      'shop_orders',
      'member_trade_listings',
      'member_trade_orders',
      'craft_tasks',
      'member_gameplay_video_uploads',
    ]) {
      expect(sql).toContain(`alter table public.${table}`)
    }
    expect(sql).toContain('add column if not exists guild_member_id uuid')
    expect(sql).toContain('add column if not exists seller_guild_member_id uuid')
    expect(sql).toContain('add column if not exists crafter_guild_member_id uuid')
    expect(sql).not.toMatch(/drop\s+column/i)
    expect(sql).not.toMatch(/delete\s+from\s+public\.guild_member/i)
  })

  it('uses tenant-composite foreign keys and exact access identity projection', () => {
    expect(sql).toContain('public.project_operational_guild_member_id()')
    expect(sql).toContain('public.resolve_guild_member_id(')
    expect(sql).toContain('public.guild_member_access_identity_type(v_subject)')
    expect(sql).toContain("raise exception 'GUILD_MEMBER_IDENTITY_MISMATCH'")
    expect(sql).toMatch(
      /foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.project_operational_guild_member_id\(\)[\s\S]*service_role/i,
    )
  })

  it('backfills later identity attachments and keeps unresolved subjects nullable', () => {
    expect(sql).toContain('public.backfill_operational_guild_member_id(')
    expect(sql).toContain('guild_member_access_identity_operational_projection')
    expect(sql).toContain('sync_operational_ownership_for_access_identity')
    expect(sql).toMatch(
      /if v_subject is null then[\s\S]*jsonb_build_object\(v_member_column, null\)/i,
    )
    expect(sql).not.toMatch(/record_guild_member_identity_conflict|status\s*=\s*'resolved'/i)
  })

  it('cuts point and inbox reads over by stable member while preserving RPC signatures', () => {
    expect(sql).toContain('public.guild_member_point_balances_v1')
    expect(sql).toContain('public.member_point_account_snapshot(')
    expect(sql).toContain('create or replace function public.member_spendable_point_balance(')
    expect(sql).toContain("p_guild_id::text || ':points:'")
    expect(sql).toContain('rename to member_work_inbox_snapshot_by_access_subject')
    expect(sql).toContain('create or replace function public.member_work_inbox_snapshot(')
    expect(sql).toContain('access.guild_member_id = v_member_id')
  })

  it('keeps all stable read helpers service-role only', () => {
    expect(sql).toMatch(
      /revoke all on public\.guild_member_point_balances_v1[\s\S]*grant select on public\.guild_member_point_balances_v1 to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.member_point_account_snapshot\(uuid, text\)[\s\S]*grant execute[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.member_work_inbox_snapshot\([\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
    )
  })

  it('keeps exchange intake, pending counts, payout, and Menhera gates on the stable owner', () => {
    expect(sql).toContain('create or replace function public.guard_member_exchange_restriction()')
    expect(sql).toContain('upload.guild_member_id = v_member_id')
    expect(sql).toContain('restriction.guild_member_id = v_member_id')
    expect(sql).toContain('create or replace function public.submit_exchange_request(')
    expect(sql).toContain("raise exception 'PENDING_EXCHANGE_EXISTS'")
    expect(sql).toContain('create or replace function public.approve_exchange_request(')
    expect(sql).toContain('public.member_point_account_snapshot(')
    expect(sql).toContain('create or replace function public.member_pending_request_counts(')
  })

  it('groups and authorizes Menhera video duties by stable member without changing RPC signatures', () => {
    expect(sql).toContain(
      'create or replace function public.refresh_alliance_content_video_requirements(',
    )
    expect(sql).toContain(
      "p_guild_id::text || ':alliance-content:'",
    )
    expect(sql).toContain('participation.guild_member_id = v_member_id')
    expect(sql).toContain('requirement.guild_member_id = v_member_id')
    expect(sql).toContain(
      'create or replace function public.rebuild_alliance_content_open_video_requirements(',
    )
    expect(sql).toContain('create or replace function public.submit_alliance_content_video(')
    expect(sql).toContain('create or replace function public.submit_member_gameplay_video(')
    expect(sql).toContain("p_guild_id::text || ':gameplay-video:' || v_member_id::text")
    expect(sql).toContain('upload.guild_member_id = v_member_id')
    expect(sql).toMatch(
      /revoke all on function public\.submit_alliance_content_video\([\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
    )
  })

  it('keeps atomic craft delivery bound to the stable crafter across linked access identities', () => {
    expect(sql).toContain("pg_get_functiondef(\n    'public.execute_supply_craft_delivery")
    expect(sql).toContain('task.crafter_guild_member_id = v_actor_member_id')
    expect(sql).toContain('crafter_guild_member_id = v_actor_member_id')
    expect(sql).toContain('SUPPLY_CRAFT_DELIVERY_SELECT_OWNER_PATCH_NOT_APPLIED')
    expect(sql).toContain('SUPPLY_CRAFT_DELIVERY_UPDATE_OWNER_PATCH_NOT_APPLIED')
    expect(sql).toMatch(
      /revoke all on function public\.execute_supply_craft_delivery\([\s\S]*from public, anon, authenticated/i,
    )
  })
})
