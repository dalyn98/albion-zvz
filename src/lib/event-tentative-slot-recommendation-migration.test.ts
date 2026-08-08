import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../../supabase/migrations/410_event_tentative_slot_recommendations.sql', import.meta.url),
  'utf8',
)

describe('event tentative slot recommendation migration', () => {
  it('keeps recommendations non-reserving and tenant/event/role scoped', () => {
    expect(sql).toContain('recommended_slot_id uuid')
    expect(sql).toMatch(/slot\.guild_id = p_guild_id/i)
    expect(sql).toMatch(/party\.event_id = p_event_id/i)
    expect(sql).toMatch(/slot\.assigned_discord_id is null/i)
    expect(sql).toMatch(/slot\.requested_discord_id is null/i)
    expect(sql).toMatch(/v_slot_role = any\(v_possible_roles\)/i)
  })

  it('clears stale recommendations and snapshots the current hint', () => {
    expect(sql).toContain('clear_event_tentative_slot_recommendations')
    expect(sql).toMatch(/new\.role_name is distinct from old\.role_name/i)
    expect(sql).toMatch(/capture_event_tentative_snapshot[\s\S]*signup\.recommended_slot_id/i)
  })

  it('exposes only the service-role atomic RPC', () => {
    expect(sql).toMatch(
      /revoke all on function public\.set_event_tentative_slot_recommendation\([\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.set_event_tentative_slot_recommendation\([\s\S]*to service_role/i,
    )
  })
})
