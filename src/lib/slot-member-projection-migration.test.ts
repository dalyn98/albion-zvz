import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '334_fix_slot_member_projection_transitions.sql',
  ),
  'utf8',
)

describe('slot member projection transition migration 334', () => {
  it('derives both stable owners after validating explicit inputs', () => {
    expect(sql).toContain(
      'create or replace function public.project_slot_guild_member_ids()',
    )
    expect(sql).toContain(
      'new.assigned_guild_member_id := v_assigned',
    )
    expect(sql).toContain(
      'new.requested_guild_member_id := v_requested',
    )
    expect(sql).toContain('ASSIGNED_GUILD_MEMBER_IDENTITY_MISMATCH')
    expect(sql).toContain('REQUESTED_GUILD_MEMBER_IDENTITY_MISMATCH')
  })

  it('distinguishes inherited stable UUIDs from explicit stable UUID changes', () => {
    expect(sql).toMatch(
      /new\.assigned_discord_id is not distinct from old\.assigned_discord_id[\s\S]*new\.assigned_guild_member_id is distinct from old\.assigned_guild_member_id/i,
    )
    expect(sql).toMatch(
      /new\.requested_discord_id is not distinct from old\.requested_discord_id[\s\S]*new\.requested_guild_member_id is distinct from old\.requested_guild_member_id/i,
    )
  })

  it('keeps the security-definer trigger helper unavailable as an RPC', () => {
    expect(sql).toMatch(
      /revoke all on function public\.project_slot_guild_member_ids\(\)[\s\S]*from public, anon, authenticated, service_role/i,
    )
  })
})
