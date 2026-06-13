import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase', 'migrations', '225_member_account_merge.sql')

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8')
}

describe('member account merge migration', () => {
  it('adds service-role only preview and execute RPCs', () => {
    const sql = migrationSql()

    expect(sql).toContain('create or replace function public.preview_member_account_merge(')
    expect(sql).toContain('create or replace function public.merge_member_accounts(')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('revoke all on function public.preview_member_account_merge')
    expect(sql).toContain('revoke all on function public.merge_member_accounts')
    expect(sql).toContain('grant execute on function public.preview_member_account_merge')
    expect(sql).toContain('grant execute on function public.merge_member_accounts')
    expect(sql).toContain('to service_role')
  })

  it('keeps all member-owned rewrites tenant scoped', () => {
    const sql = migrationSql()

    for (const table of [
      'guild_avatars',
      'point_ledger',
      'exchange_requests',
      'donation_requests',
      'shop_orders',
      'regear_requests',
      'killboard_events',
      'slots',
      'event_tentative_signups',
      'event_regear_participants',
      'event_build_applications',
      'event_payout_requests',
      'craft_tasks',
      'settlement_lines',
      'permission_user_overrides',
      'guild_local_accounts',
    ]) {
      expect(sql).toMatch(new RegExp(`public\\.${table}[\\s\\S]{0,260}guild_id\\s*=\\s*p_guild_id`, 'i'))
    }
  })

  it('blocks natural-key conflicts before rewriting IDs', () => {
    const sql = migrationSql()

    expect(sql).toContain('slot_event_conflict')
    expect(sql).toContain('exchange_pending_conflict')
    expect(sql).toContain('regear_event_conflict')
    expect(sql).toContain('event_payout_participant_conflict')
    expect(sql).toContain('event_tentative_conflict')
    expect(sql).toContain('event_regear_participant_conflict')
    expect(sql).toContain('event_build_application_conflict')
    expect(sql).toContain('settlement_line_conflict')
    expect(sql).toContain('albion_identity_conflict')
    expect(sql).toContain('pg_advisory_xact_lock')
  })

  it('preserves audit actors while moving member-owned rows', () => {
    const sql = migrationSql()

    expect(sql).toContain('target_discord_id')
    expect(sql).toMatch(/action,\s*trust_status,\s*relation,\s*reason/)
    expect(sql).not.toContain('update public.super_admin_audit_log')
    expect(sql).not.toContain('update public.admin_audit_log')
    expect(sql).not.toContain('set handled_by = p_to_discord_id')
    expect(sql).not.toContain('set resolved_by = p_to_discord_id')
    expect(sql).not.toContain('set created_by = p_to_discord_id')
  })
})
