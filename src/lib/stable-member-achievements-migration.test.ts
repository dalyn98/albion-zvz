import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '338_stable_member_achievement_ownership.sql',
  ),
  'utf8',
)

describe('stable member achievement ownership migration 338', () => {
  it('backfills exact tenant identities and makes stable ownership mandatory', () => {
    expect(sql).toMatch(
      /alter table public\.member_achievements[\s\S]*add column if not exists guild_member_id uuid/i,
    )
    expect(sql).toContain('public.resolve_guild_member_id(')
    expect(sql).toContain('public.guild_member_access_identity_type(achievement.discord_id)')
    expect(sql).toContain('ACHIEVEMENT_OWNER_BACKFILL_INCOMPLETE')
    expect(sql).toContain('ACHIEVEMENT_OWNER_BACKFILL_MISMATCH')
    expect(sql).toMatch(
      /alter table public\.member_achievements[\s\S]*alter column guild_member_id set not null/i,
    )
  })

  it('keeps Discord compatibility evidence and enforces one stable owner per fact', () => {
    expect(sql.toLowerCase()).not.toContain('drop column discord_id')
    expect(sql).toMatch(
      /foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
    expect(sql).toMatch(
      /create unique index[\s\S]*member_achievements_stable_evidence_key[\s\S]*guild_member_id[\s\S]*achievement_key[\s\S]*evidence_id/i,
    )
    expect(sql).toContain('ACHIEVEMENT_STABLE_OWNER_DUPLICATE')
  })

  it('projects future inserts and rejects an identity-owner mismatch', () => {
    expect(sql).toContain('create or replace function public.project_member_achievement_owner()')
    expect(sql).toContain('ACHIEVEMENT_MEMBER_RECORD_REQUIRED')
    expect(sql).toContain('ACHIEVEMENT_MEMBER_RECORD_MISMATCH')
    expect(sql).toMatch(
      /before insert or update of guild_id, discord_id[\s\S]*on public\.member_achievements/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.project_member_achievement_owner\(\)[\s\S]*from public, anon, authenticated, service_role/i,
    )
  })

  it('moves history on a stable-record merge without exposing trigger internals', () => {
    expect(sql).toContain('create or replace function public.reassign_member_achievements_after_merge()')
    expect(sql).toMatch(
      /delete from public\.member_achievements source[\s\S]*target\.achievement_key = source\.achievement_key[\s\S]*target\.evidence_id = source\.evidence_id/i,
    )
    expect(sql).toMatch(
      /update public\.member_achievements[\s\S]*set guild_member_id = new\.merged_into_member_id/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.reassign_member_achievements_after_merge\(\)[\s\S]*from public, anon, authenticated, service_role/i,
    )
  })

  it('does not change battle qualification, definitions, or economic state', () => {
    for (const forbidden of [
      'guild_battle_stat_units',
      'guild_battle_stat_events',
      'point_ledger',
      'regear_requests',
      'permission_role_grants',
      'member_gameplay_video_uploads',
    ]) {
      expect(sql).not.toContain(forbidden)
    }
  })
})
