import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'supabase/migrations/414_started_event_late_signups.sql'),
  'utf8',
)
const memberAction = readFileSync(join(root, 'src/app/actions/member.ts'), 'utf8')
const guestProfileAction = readFileSync(
  join(root, 'src/app/actions/event-guest-profile.ts'),
  'utf8',
)
const guestExperience = readFileSync(
  join(root, 'src/components/EventGuestExperience.tsx'),
  'utf8',
)

describe('started event late signup contract', () => {
  it('pairs a late slot signup with its frozen policy snapshot atomically', () => {
    expect(migration).toMatch(
      /assign_event_slot_with_regear_snapshot[\s\S]*insert_event_regear_slot_participant_snapshot[\s\S]*public\.assign_slot/i,
    )
    expect(memberAction).toContain("'assign_event_slot_with_regear_snapshot'")
    expect(memberAction).toContain('prepareEventSlotRegearParticipantSnapshot')
  })

  it('keeps guest recruitment open after start while retaining the cancel lock', () => {
    expect(migration).toMatch(
      /assign_guest_event_slot_with_regear_snapshot[\s\S]*insert_event_regear_slot_participant_snapshot[\s\S]*assign_guest_event_slot/i,
    )
    const guestAssignBody = migration.match(
      /create or replace function public\.assign_guest_event_slot\([\s\S]*?\n\$\$;/i,
    )?.[0] ?? ''
    expect(guestAssignBody).not.toContain('GUEST_RECRUITMENT_CLOSED')
    expect(guestAssignBody).not.toContain('event_regear_roster_locked')
    expect(migration).not.toContain('create or replace function public.cancel_guest_event_application')
    expect(guestProfileAction).not.toContain("t('recruitmentClosed')")
    expect(guestExperience).toContain(
      'canApplyToSlots={Boolean(profile && currentGuestId)}',
    )
  })
})
