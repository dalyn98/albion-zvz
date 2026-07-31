import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/339_discord_event_cancel_command.sql'),
  'utf8',
)

describe('Discord event cancellation command migration 339', () => {
  it('allows legacy slot commands to clear their stable projections', () => {
    expect(sql).toContain('create or replace function public.project_slot_guild_member_ids()')
    expect(sql).toMatch(
      /if new\.assigned_discord_id is not null[\s\S]*new\.assigned_guild_member_id is not null[\s\S]*v_assigned is null/i,
    )
    expect(sql).toMatch(
      /if new\.requested_discord_id is not null[\s\S]*new\.requested_guild_member_id is not null[\s\S]*v_requested is null/i,
    )
    expect(sql).toContain('new.assigned_guild_member_id := v_assigned')
    expect(sql).toContain('new.requested_guild_member_id := v_requested')
    expect(sql).toMatch(
      /revoke all on function public\.project_slot_guild_member_ids\(\)[\s\S]*service_role/i,
    )
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
