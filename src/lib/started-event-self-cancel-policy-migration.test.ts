import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/364_started_event_self_cancel_only_lock.sql',
  ),
  'utf8',
)
const tentativeGuardSql = sql.slice(
  sql.indexOf('create or replace function public.guard_event_tentative_signup_recruitment()'),
  sql.indexOf('create or replace function public.cleanup_tentative_on_slot_fill()'),
)
const memberAction = readFileSync(
  join(process.cwd(), 'src/app/actions/member.ts'),
  'utf8',
)
const partyAction = readFileSync(
  join(process.cwd(), 'src/app/actions/admin-party-slot.ts'),
  'utf8',
)
const buildSheetAction = readFileSync(
  join(process.cwd(), 'src/app/actions/build-sheet.ts'),
  'utf8',
)
const slotCard = readFileSync(
  join(process.cwd(), 'src/components/SlotCard.tsx'),
  'utf8',
)

describe('started-event self-cancel-only policy migration', () => {
  it('keeps historical boundaries and settlement snapshots immutable', () => {
    expect(sql).toMatch(
      /guard_started_event_snapshot[\s\S]*event_operational_snapshot_locked/i,
    )
    for (const column of [
      'battle_started_at',
      'operational_ended_at',
      'regear_policy_version_id',
      'regear_policy_config_snapshot',
      'tentative_snapshot_version_id',
    ]) {
      expect(sql).toContain(column)
    }
  })

  it('reopens authorized event, party, slot, regear-roster, and tentative edits', () => {
    for (const functionName of [
      'guard_started_event_direct_child',
      'guard_started_event_slots',
      'guard_frozen_event_regear_slot_inputs',
      'guard_frozen_event_regear_party_inputs',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${functionName}\\(\\)[\\s\\S]*?if tg_op = 'DELETE'[\\s\\S]*?return new;`,
          'i',
        ),
      )
    }
    expect(tentativeGuardSql).toMatch(
      /guard_event_tentative_signup_recruitment[\s\S]*v_status <> 'published'/i,
    )
    expect(tentativeGuardSql).not.toContain('v_battle_started_at')
  })

  it('blocks only assigned self-removal after start and keeps pending withdrawal open', () => {
    expect(sql).toMatch(
      /if v_assigned = p_discord_id then[\s\S]*v_battle_started_at is not null[\s\S]*EVENT_PARTICIPANT_SELF_CANCEL_LOCKED/i,
    )
    expect(sql).toMatch(
      /elsif v_requested = p_discord_id then[\s\S]*requested_discord_id = null/i,
    )
    expect(sql).toMatch(
      /current_setting\('app\.started_event_admin_roster_write', true\) = 'on'[\s\S]*current_user in \('postgres', 'service_role'\)/i,
    )
  })

  it('keeps cancel_slot service-only with a fixed search path', () => {
    expect(sql).toMatch(
      /create or replace function public\.cancel_slot\([\s\S]*security definer[\s\S]*set search_path = public/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.cancel_slot\(uuid, text\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.cancel_slot\(uuid, text\)[\s\S]*to service_role/i,
    )
  })

  it('keeps every non-manager self-removal entry point behind the same start boundary', () => {
    expect(memberAction).toMatch(
      /event\?\.battle_started_at[\s\S]*!isFullEventManager[\s\S]*slotRow\.assigned_discord_id === session\.discordId/i,
    )
    expect(partyAction).toMatch(
      /eventRow\.battle_started_at && !isAdminOrOwner[\s\S]*currentSelfSlots[\s\S]*battleAlreadyStarted/i,
    )
    expect(buildSheetAction).toMatch(
      /event\.battle_started_at[\s\S]*!isFullEventManager[\s\S]*app\.applicant_discord_id === session\.discordId/i,
    )
    expect(slotCard).toMatch(
      /battleStarted && isMine && !canManageSlots/i,
    )
  })
})
