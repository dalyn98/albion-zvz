import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/340_discord_event_cancel_command.sql'),
  'utf8',
)

describe('Discord event cancellation command migration 340', () => {
  it('preserves migration 334 slot projection behavior', () => {
    expect(sql).toContain('Migration 334 owns the stable slot projection contract')
    expect(sql).not.toContain('create or replace function public.project_slot_guild_member_ids()')
  })

  it('atomically covers member slots, guest lifecycle, and tentative intent', () => {
    expect(sql).toContain('create or replace function public.cancel_member_event_signup(')
    expect(sql).toContain('perform public.cancel_guest_event_application(')
    expect(sql).toContain('perform public.cancel_slot(v_slot_id, p_discord_id)')
    expect(sql).toContain('delete from public.event_tentative_signups')
    expect(sql).toContain("v_event.recruitment_mode = 'build_sheet'")
  })

  it('locks the exact tenant event and rejects post-start changes', () => {
    expect(sql).toMatch(/event\.guild_id = p_guild_id[\s\S]*event\.id = p_event_id[\s\S]*for update/i)
    expect(sql).toContain('v_event.battle_started_at is not null')
    expect(sql).toContain('v_event.regear_policy_version_id is not null')
  })

  it('is callable only by the service role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.cancel_member_event_signup\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.cancel_member_event_signup\(uuid, uuid, text\)[\s\S]*to service_role/i,
    )
  })
})
