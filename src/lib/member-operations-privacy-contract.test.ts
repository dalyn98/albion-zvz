import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const retiredRuntimePaths = [
  'src/app/actions/member-operations.ts',
  'src/components/MemberAbsenceSettings.tsx',
  'src/components/MemberTrialCard.tsx',
  'src/lib/member-operations-server.ts',
  'src/lib/member-operations.ts',
] as const

const operationalSurfaces = [
  'src/app/(app-shell)/admin/dashboard/events/[id]/page.tsx',
  'src/app/(app-shell)/admin/dashboard/members/[discordId]/page.tsx',
  'src/app/(app-shell)/events/[id]/page.tsx',
  'src/app/(app-shell)/me/settings/page.tsx',
  'src/app/(app-shell)/members/[discordId]/page.tsx',
  'src/components/EventEditSaveBar.tsx',
] as const

describe('retired member trial and absence boundary', () => {
  it('removes the unapproved runtime input and decision surfaces', () => {
    for (const path of retiredRuntimePaths) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(false)
    }

    for (const path of operationalSurfaces) {
      const source = read(path)
      expect(source, path).not.toMatch(
        /member-operations|MemberTrialCard|MemberAbsenceSettings|memberAbsence|trialProfile|assignedAbsences|myEventAbsences/,
      )
    }
  })

  it('keeps the shared member directory free of retired state', () => {
    const source = read('src/app/actions/members-admin.ts')
    expect(source).toContain('sessionHas(session, CAP.MEMBERS_MANAGE)')
    expect(source).not.toContain('loadMemberOperationSummaryMap')
    expect(source).not.toContain('trial_status:')
    expect(source).not.toContain('active_absence:')
  })

  it('preserves historical rows while blocking every application write path', () => {
    const sql = read(
      'supabase/migrations/322_retire_unapproved_member_operations.sql',
    )

    expect(sql).toMatch(
      /revoke insert, update, delete[\s\S]*member_trial_profiles[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /revoke insert, update, delete[\s\S]*member_absences[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /grant select on table public\.member_trial_profiles to service_role/i,
    )
    expect(sql).toMatch(
      /grant select on table public\.member_absences to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all[\s\S]*save_member_trial[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /revoke all[\s\S]*create_member_absence[\s\S]*service_role/i,
    )
    expect(sql).not.toMatch(/\b(drop|truncate|delete from)\b/i)
  })
})
