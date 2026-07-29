import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tentativeSql = readFileSync(
  new URL(
    '../../supabase/migrations/301_event_tentative_signup_lifecycle.sql',
    import.meta.url,
  ),
  'utf8',
)
const closeoutSql = readFileSync(
  new URL(
    '../../supabase/migrations/302_event_participation_closeout.sql',
    import.meta.url,
  ),
  'utf8',
)
const legacyAction = readFileSync(
  new URL('../app/actions/event-payout-admin.ts', import.meta.url),
  'utf8',
)
const reportAction = readFileSync(
  new URL('../app/actions/event-report.ts', import.meta.url),
  'utf8',
)
const tentativeComponent = readFileSync(
  new URL('../components/TentativeSignupSection.tsx', import.meta.url),
  'utf8',
)
const memberEventPage = readFileSync(
  new URL('../app/(app-shell)/events/[id]/page.tsx', import.meta.url),
  'utf8',
)
const adminEventPage = readFileSync(
  new URL(
    '../app/(app-shell)/admin/dashboard/events/[id]/page.tsx',
    import.meta.url,
  ),
  'utf8',
)
const activeTentativeConsumers = [
  '../app/(app-shell)/page.tsx',
  '../app/(app-shell)/me/page.tsx',
  '../app/actions/me-dashboard.ts',
  '../lib/discord-command-autocomplete.ts',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
const discordCommandSuite = readFileSync(
  new URL('../lib/discord-command-suite.ts', import.meta.url),
  'utf8',
)

describe('event participation closeout migration contract', () => {
  it('freezes weak tentative availability at first operational start', () => {
    expect(tentativeSql).toMatch(
      /alter table public\.events[\s\S]*tentative_snapshot_version_id uuid[\s\S]*tentative_snapshotted_at timestamptz/i,
    )
    expect(tentativeSql).toMatch(
      /create table if not exists public\.event_tentative_signup_snapshots[\s\S]*unique \(guild_id, event_id, discord_id\)/i,
    )
    expect(tentativeSql).toMatch(
      /prepare_event_tentative_snapshot[\s\S]*old\.battle_started_at is null[\s\S]*new\.battle_started_at is not null[\s\S]*gen_random_uuid/i,
    )
    expect(tentativeSql).toMatch(
      /capture_event_tentative_snapshot[\s\S]*not exists \([\s\S]*slot\.assigned_discord_id = signup\.discord_id/i,
    )
  })

  it('backfills a read-only compatibility snapshot for already-started events', () => {
    expect(tentativeSql).toMatch(
      /with backfilled_events as \([\s\S]*update public\.events[\s\S]*statement_timestamp\(\)[\s\S]*battle_started_at is not null[\s\S]*tentative_snapshot_version_id is null/i,
    )
    expect(tentativeSql).toMatch(
      /from backfilled_events as event[\s\S]*join public\.event_tentative_signups as signup[\s\S]*not exists \([\s\S]*slot\.assigned_discord_id = signup\.discord_id/i,
    )
    expect(tentativeSql).toMatch(
      /events_started_tentative_snapshot_required_chk[\s\S]*status <> 'published'[\s\S]*battle_started_at is null[\s\S]*tentative_snapshot_version_id is not null/i,
    )
    expect(tentativeSql).toMatch(
      /prepare_event_tentative_snapshot[\s\S]*tg_op = 'INSERT'[\s\S]*new\.battle_started_at is not null[\s\S]*new\.tentative_snapshot_version_id := gen_random_uuid\(\)/i,
    )
  })

  it('locks every tentative write to published pre-start recruitment', () => {
    expect(tentativeSql).toMatch(
      /guard_event_tentative_signup_recruitment[\s\S]*v_status <> 'published'[\s\S]*v_battle_started_at is not null[\s\S]*v_snapshot_version_id is not null[\s\S]*event_tentative_recruitment_closed/i,
    )
    expect(tentativeSql).toMatch(
      /before insert or update or delete[\s\S]*on public\.event_tentative_signups/i,
    )
    expect(tentativeSql).toMatch(/for share of event/i)
    expect(tentativeSql).toMatch(
      /tg_op = 'DELETE' and pg_trigger_depth\(\) > 1[\s\S]*return old/i,
    )
  })

  it('keeps recruitment read-only after a battle-start reset', () => {
    expect(tentativeComponent).toContain('recruitmentClosed')
    expect(tentativeComponent).not.toMatch(/\bbattleStarted:\s*boolean/)
    for (const source of [memberEventPage, adminEventPage]) {
      expect(source).toMatch(
        /event\.battle_started_at\s*\|\|\s*event\.tentative_snapshot_version_id/,
      )
    }
    for (const source of activeTentativeConsumers) {
      expect(source).toContain(
        ".is('events.tentative_snapshot_version_id', null)",
      )
    }
    expect(discordCommandSuite).toMatch(
      /!event\.battle_started_at\s*&&\s*!event\.tentative_snapshot_version_id/,
    )
  })

  it('removes tentative availability only for a tenant-scoped confirmed assignment', () => {
    expect(tentativeSql).toMatch(
      /cleanup_tentative_on_slot_fill[\s\S]*new\.assigned_discord_id[\s\S]*where guild_id = v_guild_id[\s\S]*event_id = v_event_id/i,
    )
    expect(tentativeSql).not.toMatch(
      /cleanup_tentative_on_slot_fill[\s\S]*new\.requested_discord_id/i,
    )
    expect(tentativeSql).toMatch(
      /cleanup_tentative_on_slot_fill[\s\S]*v_battle_started_at is null[\s\S]*v_snapshot_version_id is null/i,
    )
  })

  it('persists final roster, target ledgers, audit, and outbox in one RPC', () => {
    expect(closeoutSql).toMatch(
      /create or replace function public\.finalize_event_participation_closeout/i,
    )
    expect(closeoutSql).toMatch(
      /from public\.events as event[\s\S]*for update of event/i,
    )
    expect(closeoutSql).toMatch(
      /insert into public\.event_participation_closeouts[\s\S]*insert into public\.event_participation_closeout_entries[\s\S]*insert into public\.point_ledger[\s\S]*insert into public\.event_participation_notification_outbox[\s\S]*insert into public\.admin_audit_log/i,
    )
    expect(closeoutSql).toMatch(/'event\.participation\.finalize'/i)
    expect(closeoutSql).toMatch(/'event_payout_approved',[\s\S]*v_entry_id/i)
    expect(closeoutSql).toMatch(
      /guild_avatars as avatar[\s\S]*avatar\.withdrawn_at is null[\s\S]*into v_username/i,
    )
    expect(closeoutSql).toMatch(
      /v_event_title := left\([\s\S]*nullif\(btrim\(v_event_title\), ''\)[\s\S]*200/i,
    )
  })

  it('requires an exact assigned-slot decision set and idempotent event closeout', () => {
    expect(closeoutSql).toMatch(/unique \(guild_id, event_id\)/i)
    expect(closeoutSql).toMatch(/unique \(guild_id, idempotency_key\)/i)
    expect(closeoutSql).toMatch(
      /expected_slots[\s\S]*provided_slots[\s\S]*event_participation_closeout_slot_roster_changed/i,
    )
    expect(closeoutSql).toMatch(
      /idempotency_key = p_idempotency_key[\s\S]*'replayed', true/i,
    )
  })

  it('keeps legacy requests resolvable while blocking new queue creation', () => {
    expect(closeoutSql).toMatch(
      /from public\.event_payout_requests[\s\S]*status in \('pending', 'approved'\)/i,
    )
    expect(legacyAction).toContain("tErr('eventPayoutUseCloseout')")
    expect(legacyAction).toContain('approve_event_payout_request')
    expect(legacyAction).toContain('reject_event_payout_request')
  })

  it('exposes closeout only to full event managers, not event owners', () => {
    expect(reportAction).toMatch(
      /canFinalizeParticipation\s*=\s*session\.isAdmin \|\| sessionHas\(session, CAP\.EVENT_MANAGE\)/,
    )
    expect(reportAction).toContain('loadEventParticipationCloseoutState')
    expect(adminEventPage).toMatch(
      /canFinalizeParticipation\s*=\s*[\s\S]*CAP\.EVENT_MANAGE/,
    )
    expect(adminEventPage).toMatch(
      /canFinalizeParticipation\s*&&\s*isEnded\(event\.battle_started_at\)/,
    )
  })

  it('keeps immutable records service-only and claims notifications durably', () => {
    expect(closeoutSql).toMatch(
      /revoke update, delete[\s\S]*event_participation_closeouts[\s\S]*event_participation_closeout_entries[\s\S]*from service_role/i,
    )
    expect(closeoutSql).toMatch(
      /create or replace function public\.claim_event_participation_notification_outbox[\s\S]*for update skip locked/i,
    )
    expect(closeoutSql).toMatch(
      /revoke all on function public\.finalize_event_participation_closeout[\s\S]*from public, anon, authenticated/i,
    )
  })
})
