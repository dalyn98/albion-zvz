import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/415_event_operational_cancellation.sql'),
  'utf8',
)

describe('event operational cancellation migration', () => {
  it('preserves start history and records an explicit terminal cancellation', () => {
    expect(sql).toMatch(/status in \('draft', 'published', 'cancelled'\)/i)
    expect(sql).toContain('operational_cancelled_at')
    expect(sql).toContain('operational_cancelled_by')
    expect(sql).toMatch(/set status = 'cancelled'/i)
    expect(sql).not.toMatch(/set battle_started_at = null/i)
  })

  it('uses a tenant-scoped service-only atomic command', () => {
    expect(sql).toMatch(/cancel_event_operations\([\s\S]*p_guild_id uuid/i)
    expect(sql).toMatch(/event\.guild_id = p_guild_id[\s\S]*event\.id = p_event_id/i)
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i)
    expect(sql).toMatch(/event_operational_cancel_write/i)
  })

  it('blocks cancellation after settlement work and prevents new regear intake', () => {
    expect(sql).toContain('event_operations_has_regear_requests')
    expect(sql).toContain('event_operations_has_closeout')
    expect(sql).toMatch(/v_event_status <> 'published'[\s\S]*event_operations_cancelled/i)
    expect(sql).toMatch(/exclude_from_participation_stats = true/i)
    expect(sql).toMatch(/auto_regear_processed_at = coalesce/i)
  })

  it('closes roster and build-sheet writes after cancellation', () => {
    expect(sql).toMatch(
      /guard_started_event_direct_child\(\)[\s\S]*event\.status = 'cancelled'[\s\S]*event_operations_cancelled/i,
    )
    expect(sql).toMatch(
      /guard_started_event_slots\(\)[\s\S]*event\.status = 'cancelled'[\s\S]*event_operations_cancelled/i,
    )
  })
})
