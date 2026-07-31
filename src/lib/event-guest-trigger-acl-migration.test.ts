import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '333_revoke_event_guest_trigger_execution.sql',
  ),
  'utf8',
)

describe('event guest trigger ACL migration 333', () => {
  it('revokes direct execution from every application role', () => {
    for (const functionName of [
      'sync_event_guest_application_from_slot',
      'guard_started_event_guest_profile',
      'guard_started_event_guest_regear_setting',
      'guard_started_event_participation_requirement',
      'guard_event_regear_actual_participant',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\(\\)[\\s\\S]*?from public, anon, authenticated, service_role`,
          'i',
        ),
      )
    }
    expect(sql.toLowerCase()).not.toContain('grant execute')
  })
})
