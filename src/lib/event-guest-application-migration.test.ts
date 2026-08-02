import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const guestSql = readFileSync(
  new URL(
    '../../supabase/migrations/331_passwordless_event_guest_applications.sql',
    import.meta.url,
  ),
  'utf8',
)
const participantGateSql = readFileSync(
  new URL(
    '../../supabase/migrations/332_actual_participant_regear_gate.sql',
    import.meta.url,
  ),
  'utf8',
)
const provisionalRegearSql = readFileSync(
  new URL(
    '../../supabase/migrations/345_provisional_event_regear_intake.sql',
    import.meta.url,
  ),
  'utf8',
)
const provisionalRegearBackfillSql = readFileSync(
  new URL(
    '../../supabase/migrations/346_backfill_event_regear_participant_confirmation.sql',
    import.meta.url,
  ),
  'utf8',
)
const guestProfileAction = readFileSync(
  new URL('../app/actions/event-guest-profile.ts', import.meta.url),
  'utf8',
)
const guestManagementRoute = readFileSync(
  new URL('../app/guest/manage/exchange/route.ts', import.meta.url),
  'utf8',
)
const memberAction = readFileSync(
  new URL('../app/actions/member.ts', import.meta.url),
  'utf8',
)

describe('passwordless event guest migration contract', () => {
  it('separates reusable recruitment access from a per-application management grant', () => {
    expect(guestSql).toMatch(
      /create table if not exists public\.event_guest_applications[\s\S]*unique \(guild_id, event_id, guest_id\)/i,
    )
    expect(guestSql).toMatch(
      /create table if not exists public\.event_guest_management_grants[\s\S]*secret_hash text not null unique/i,
    )
    expect(guestSql).toMatch(
      /event_guest_management_grants_active_application_idx[\s\S]*where revoked_at is null/i,
    )
    expect(guestSql).not.toMatch(/raw_secret|management_secret text/i)
    expect(guestManagementRoute).toContain(
      'hashEventGuestManagementSecret(token)',
    )
    expect(guestManagementRoute).not.toMatch(/\.eq\(['"]secret['"]/)
    expect(memberAction).toContain(
      'managementPath = `/guest/manage#${managementSecret}`',
    )
    expect(memberAction).not.toMatch(/\/guest\/manage\/\$\{managementSecret\}/)
    expect(guestManagementRoute).toContain('isSameOriginPost(request)')
    expect(guestManagementRoute).toContain('MAX_EXCHANGE_BODY_BYTES')
  })

  it('commits slot assignment, application history, and management recovery atomically', () => {
    expect(guestSql).toMatch(
      /create or replace function public\.assign_guest_event_slot[\s\S]*perform public\.assign_slot[\s\S]*insert into public\.event_guest_applications[\s\S]*insert into public\.event_guest_management_grants/i,
    )
    expect(guestSql).toMatch(
      /v_application\.idempotency_key = p_idempotency_key[\s\S]*'replayed', true/i,
    )
    expect(guestSql).toMatch(
      /event_guest_applications_verified_character_active_idx[\s\S]*event_guest_applications_manual_character_active_idx/i,
    )
    expect(guestSql).toMatch(
      /when unique_violation[\s\S]*GUEST_CHARACTER_ALREADY_APPLIED/i,
    )
  })

  it('locks recruitment and identity after the operational boundary', () => {
    expect(guestSql).toMatch(
      /assign_guest_event_slot[\s\S]*v_event\.battle_started_at is not null[\s\S]*GUEST_RECRUITMENT_CLOSED/i,
    )
    expect(guestSql).toMatch(
      /cancel_guest_event_application[\s\S]*v_started_at is not null[\s\S]*event_regear_roster_locked/i,
    )
    expect(guestSql).toMatch(
      /guard_started_event_guest_profile[\s\S]*new\.albion_character_name is distinct from old\.albion_character_name[\s\S]*event_guest_participation_locked/i,
    )
    expect(guestSql).toMatch(
      /guard_started_event_guest_regear_setting[\s\S]*event_operational_snapshot_locked/i,
    )
  })

  it('stores only short-lived HMAC scopes for abuse control', () => {
    expect(guestSql).toMatch(
      /create table if not exists public\.event_guest_request_buckets[\s\S]*scope_hash text not null[\s\S]*expires_at timestamptz not null/i,
    )
    expect(guestSql).not.toMatch(/\bip_address\b|\buser_agent\b/i)
    expect(guestProfileAction).toContain(
      'consumeEventGuestRequestBudget',
    )
  })

  it('keeps all guest tables and commands service-only', () => {
    for (const table of [
      'event_guest_applications',
      'event_guest_management_grants',
      'event_guest_request_buckets',
    ]) {
      expect(guestSql).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          'i',
        ),
      )
      expect(guestSql).toMatch(
        new RegExp(
          `revoke all on public\\.${table} from public, anon, authenticated`,
          'i',
        ),
      )
    }
    for (const fn of [
      'consume_event_guest_request_budget',
      'assign_guest_event_slot',
      'cancel_guest_event_application',
    ]) {
      expect(guestSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}[\\s\\S]*?public, anon, authenticated`,
          'i',
        ),
      )
      expect(guestSql).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}[\\s\\S]*?service_role`,
          'i',
        ),
      )
    }
  })
})

describe('actual participant regear migration contract', () => {
  it('preserves legacy events and requires closeout for newly created events', () => {
    expect(participantGateSql).toMatch(
      /add column if not exists participation_closeout_required boolean[\s\S]*default false[\s\S]*alter column participation_closeout_required set default true/i,
    )
    expect(participantGateSql).toMatch(
      /guard_started_event_participation_requirement[\s\S]*event_operational_snapshot_locked/i,
    )
  })

  it('accepts only immutable included participants for new event claims', () => {
    expect(participantGateSql).toMatch(
      /guard_event_regear_actual_participant[\s\S]*event_participation_closeout_entries[\s\S]*entry\.decision = 'included'[\s\S]*event_actual_participant_required/i,
    )
  })

  it('keeps guest claims explicit, manual, and death-only', () => {
    expect(participantGateSql).toMatch(
      /event_guest_applications[\s\S]*application\.status = 'assigned'/i,
    )
    expect(participantGateSql).toMatch(
      /not v_guest_regear_enabled[\s\S]*event_guest_regear_disabled/i,
    )
    expect(participantGateSql).toMatch(
      /new\.auto_generated is true[\s\S]*event_guest_auto_regear_forbidden/i,
    )
    expect(participantGateSql).toMatch(
      /new\.request_type is distinct from 'death'[\s\S]*event_guest_regear_death_only/i,
    )
  })
})

describe('provisional event regear intake contract', () => {
  it('separates review status from the actual-participant approval gate', () => {
    expect(provisionalRegearSql).toMatch(
      /add column if not exists participant_confirmation_status text[\s\S]*awaiting_closeout[\s\S]*confirmed[\s\S]*excluded/i,
    )
    expect(provisionalRegearSql).toMatch(
      /regear_requests_approval_participant_confirmation_chk[\s\S]*status <> 'approved'[\s\S]*'not_required', 'confirmed'/i,
    )
    expect(provisionalRegearSql).toMatch(
      /guard_regear_participant_confirmation_on_approval[\s\S]*REGEAR_PARTICIPANT_CONFIRMATION_PENDING/i,
    )
  })

  it('accepts only manual snapshotted claims before closeout', () => {
    expect(provisionalRegearSql).toMatch(
      /v_closeout_finalized[\s\S]*new\.auto_generated is true[\s\S]*event_actual_participant_required/i,
    )
    expect(provisionalRegearSql).toMatch(
      /event_regear_policy_snapshots[\s\S]*snapshot\.discord_id = new\.discord_id[\s\S]*new\.event_regear_policy_snapshot_id[\s\S]*awaiting_closeout/i,
    )
  })

  it('confirms included claims and rejects excluded claims in the closeout transaction', () => {
    expect(provisionalRegearSql).toMatch(
      /reconcile_event_regear_from_closeout_entry[\s\S]*new\.decision = 'included'[\s\S]*participant_confirmation_status = 'confirmed'/i,
    )
    expect(provisionalRegearSql).toMatch(
      /participant_confirmation_status = 'excluded'[\s\S]*status = case[\s\S]*'not_actual_participant'/i,
    )
  })

  it('keeps trigger functions non-callable and backfills only included historical claims', () => {
    for (const fn of [
      'guard_event_regear_actual_participant',
      'guard_regear_participant_confirmation_on_approval',
      'reconcile_event_regear_from_closeout_entry',
    ]) {
      expect(provisionalRegearSql).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?service_role`, 'i'),
      )
    }
    expect(provisionalRegearBackfillSql).toMatch(
      /event_participation_closeout_entries[\s\S]*entry\.decision = 'included'/i,
    )
    expect(provisionalRegearBackfillSql).not.toMatch(/insert into|delete from/i)
  })
})
