import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '321_stable_member_read_cutover.sql',
  ),
  'utf8',
)

describe('stable guild member read cutover migration 321', () => {
  it('keeps legacy contact columns and adds nullable stable ownership', () => {
    for (const column of [
      'assigned_guild_member_id',
      'requested_guild_member_id',
      'guild_member_id',
    ]) {
      expect(sql).toContain(column)
    }
    expect(sql.toLowerCase()).not.toContain('drop column discord_id')
    expect(sql.toLowerCase()).not.toContain('drop column assigned_discord_id')
    expect(sql.toLowerCase()).not.toContain('drop column requested_discord_id')
    expect(sql).toMatch(
      /foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
  })

  it('backfills and projects event and regear ownership from exact tenant identities', () => {
    expect(sql).toContain('public.resolve_guild_member_id(')
    for (const table of [
      'slots',
      'event_tentative_signups',
      'event_tentative_signup_snapshots',
      'event_participation_closeout_entries',
      'event_regear_participants',
      'regear_requests',
    ]) {
      expect(sql).toMatch(new RegExp(`update public\\.${table}\\b`, 'i'))
      expect(sql).toMatch(
        new RegExp(`on public\\.${table}[\\s\\S]*project_`, 'i'),
      )
    }
    expect(sql).toContain(
      'public.guild_member_access_identity_type(new.discord_id)',
    )
    expect(sql).toContain('GUILD_MEMBER_IDENTITY_MISMATCH')
  })

  it('backfills closed tentative recruitment without disabling its lifecycle guard', () => {
    expect(sql).toMatch(
      /create or replace function public\.guard_event_tentative_signup_recruitment\(\)[\s\S]*to_jsonb\(new\) - 'guild_member_id'[\s\S]*to_jsonb\(old\) - 'guild_member_id'[\s\S]*return new/i,
    )
    expect(sql).toMatch(
      /guard_event_tentative_signup_recruitment[\s\S]*event_tentative_recruitment_closed/i,
    )
    expect(sql).not.toMatch(
      /disable trigger\s+guard_event_tentative_signup_recruitment/i,
    )
    expect(sql).toMatch(
      /create trigger project_tentative_guild_member_id[\s\S]*before insert or update of guild_id, discord_id, guild_member_id[\s\S]*on public\.event_tentative_signups/i,
    )
  })

  it('flushes the deferred regear policy guard before validating the new FK', () => {
    expect(sql).toMatch(
      /update public\.regear_requests[\s\S]*set constraints public\.guard_regear_request_policy_snapshot_scope immediate[\s\S]*alter table public\.regear_requests[\s\S]*validate constraint regear_requests_guild_member_fkey/i,
    )
  })

  it('provides a service-only one-row-per-member directory with explicit display priority', () => {
    expect(sql).toContain('create or replace view public.guild_member_directory_v1')
    expect(sql).toMatch(
      /coalesce\([\s\S]*member\.display_name_override[\s\S]*character\.albion_player_name[\s\S]*member\.display_name_snapshot[\s\S]*avatar\.username/i,
    )
    expect(sql).toContain(
      'access.revoked_at as discord_access_revoked_at',
    )
    expect(sql).toMatch(
      /revoke all on public\.guild_member_directory_v1[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant select on public\.guild_member_directory_v1 to service_role/i,
    )
  })

  it('updates a guild display override atomically with an audit record', () => {
    expect(sql).toContain(
      'create or replace function public.set_guild_member_display_name(',
    )
    expect(sql).toMatch(
      /update public\.guild_member_records[\s\S]*insert into public\.admin_audit_log/i,
    )
    expect(sql).toContain("'member.display_name.update'")
    expect(sql).toMatch(
      /revoke all on function public\.set_guild_member_display_name[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.set_guild_member_display_name[\s\S]*to service_role/i,
    )
  })

  it('does not expose trigger internals as callable RPCs', () => {
    for (const fn of [
      'project_guild_member_id_from_discord',
      'project_slot_guild_member_ids',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
          'i',
        ),
      )
    }
  })
})
