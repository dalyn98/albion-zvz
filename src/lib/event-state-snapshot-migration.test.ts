import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/273_event_snapshot_slot_assignments.sql'),
  'utf8',
)

describe('event state snapshot migration', () => {
  it('keeps the snapshot tenant scoped and service-role only', () => {
    expect(sql).toMatch(/get_event_state_snapshot\s*\(/i)
    expect(sql).toMatch(/e\.guild_id\s*=\s*p_guild_id/i)
    expect(sql).toMatch(/p\.guild_id\s*=\s*p_guild_id/i)
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i)
    expect(sql).toMatch(/revoke all[\s\S]*from anon, authenticated/i)
  })

  it('observes party versions, live slot state, and every recruitment source', () => {
    expect(sql).toContain('to_jsonb(p)')
    expect(sql).toContain('s.assigned_discord_id')
    expect(sql).toContain('s.assigned_mount_id')
    expect(sql).toContain('s.requested_discord_id')
    expect(sql).toContain('s.requested_picks')
    expect(sql).toContain('event_tentative_signups')
    expect(sql).toContain('event_build_role_demands')
    expect(sql).toContain('event_build_party_assigners')
    expect(sql).toContain('event_build_applications')
  })
})
