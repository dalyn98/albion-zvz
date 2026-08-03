import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/361_started_event_admin_roster_changes.sql'),
  'utf8',
)
const cacheReloadSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/362_reload_started_event_admin_roster_rpcs.sql',
  ),
  'utf8',
)

describe('started event admin roster migration', () => {
  it('keeps the trigger bypass transaction-local and privileged', () => {
    expect(sql).toMatch(
      /current_setting\('app\.started_event_admin_roster_write', true\) = 'on'[\s\S]*current_user in \('postgres', 'service_role'\)/i,
    )
    expect(sql).toMatch(
      /set_config\('app\.started_event_admin_roster_write', 'on', true\)/i,
    )
  })

  it('exposes only tenant-scoped service-role roster correction RPCs', () => {
    for (const name of [
      'admin_direct_assign_event_slot',
      'admin_cancel_event_slot',
      'admin_approve_event_slot_request',
      'admin_reject_event_slot_request',
    ]) {
      expect(sql).toMatch(
        new RegExp(`create or replace function public\\.${name}\\(`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, 'i'),
      )
    }
    expect(sql).toMatch(/slot\.guild_id = p_guild_id[\s\S]*slot\.id = p_slot_id/i)
  })

  it('reloads the PostgREST schema cache for the new RPCs', () => {
    expect(sql).toMatch(/notify pgrst, 'reload schema'/i)
    expect(cacheReloadSql).toMatch(/notify pgrst, 'reload schema'/i)
  })
})
