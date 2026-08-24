import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const snapshotSql = source(
  'supabase/migrations/298_event_effective_regear_policy_snapshots.sql',
)
const originBackfillSql = source(
  'supabase/migrations/299_regear_origin_type_backfill.sql',
)
const originInvariantSql = source(
  'supabase/migrations/300_regear_origin_type_invariant.sql',
)
const effectivePolicyServer = source(
  'src/lib/regear-effective-policy-server.ts',
)
const manualRegearAction = source('src/app/actions/regear.ts')
const freeWindowAction = source('src/app/actions/regear-windows.ts')
const autoRegearSource = source('src/lib/auto-regear.ts')
const statsAction = source('src/app/actions/stats-admin.ts')
const eventStatsAction = source('src/app/actions/stats-admin.ts')
const adminEventAction = source('src/app/actions/admin-event.ts')
const discordCommerceAdmin = source(
  'src/lib/discord-command-commerce-admin.ts',
)
const automaticStart = source('src/lib/event-auto-start.ts')
const guestStartValidationSql = source(
  'supabase/migrations/419_guest_aware_event_start_snapshot_validation.sql',
)
const staleCronSql = source(
  'supabase/migrations/420_expire_stale_cron_runs.sql',
)
const eventRenderSnapshot = source('src/lib/event-render-snapshot.ts')

describe('effective regear policy migrations and read paths', () => {
  it('adds complete, bounded event and free-window config snapshots', () => {
    expect(snapshotSql).toMatch(
      /alter table public\.events[\s\S]*regear_policy_version_id uuid[\s\S]*regear_policy_config_snapshot jsonb[\s\S]*regear_policy_snapshotted_at timestamptz/i,
    )
    expect(snapshotSql).toMatch(
      /alter table public\.regear_windows[\s\S]*regear_policy_version_id uuid[\s\S]*regear_policy_config_snapshot jsonb/i,
    )
    expect(snapshotSql).toMatch(
      /events_regear_policy_snapshot_complete_chk[\s\S]*octet_length\(regear_policy_config_snapshot::text\) <= 524288/i,
    )
    expect(snapshotSql).toMatch(
      /regear_windows_policy_snapshot_complete_chk[\s\S]*octet_length\(regear_policy_config_snapshot::text\) <= 524288/i,
    )
  })

  it('freezes the event and all participant policies in one locked RPC', () => {
    expect(snapshotSql).toMatch(
      /create or replace function public\.start_event_with_regear_policy_snapshots/i,
    )
    expect(snapshotSql).toMatch(/from public\.events as e[\s\S]*for update of e/i)
    expect(snapshotSql).toMatch(
      /update public\.events[\s\S]*battle_started_at = p_started_at[\s\S]*insert into public\.event_regear_policy_snapshots/i,
    )
    expect(snapshotSql).toMatch(
      /unique \(guild_id, event_id, discord_id\)/i,
    )
    expect(effectivePolicyServer).toContain(
      ".rpc('start_event_with_regear_policy_snapshots'",
    )
    expect(snapshotSql).toMatch(
      /guard_frozen_event_regear_slot_inputs[\s\S]*for key share of e[\s\S]*event_regear_roster_locked/i,
    )
    expect(snapshotSql).toMatch(
      /guard_frozen_event_regear_config[\s\S]*event_regear_policy_locked/i,
    )
    expect(snapshotSql).toMatch(
      /count\(distinct discord_id\)[\s\S]*event_regear_roster_changed/i,
    )
    expect(snapshotSql).toMatch(
      /p_policy_config_snapshot ->> 'guildId'[\s\S]*p_guild_id::text[\s\S]*p_policy_config_snapshot ->> 'eventId'[\s\S]*p_event_id::text/i,
    )
    expect(snapshotSql).toMatch(
      /p_policy_config_snapshot -> 'event'[\s\S]*v_current_event_config[\s\S]*p_policy_config_snapshot -> 'roleOverrides'[\s\S]*v_current_role_overrides[\s\S]*event_regear_policy_config_changed/i,
    )
    expect(snapshotSql).toMatch(
      /event_regear_snapshot_count_mismatch/i,
    )
  })

  it('uses the event policy version for atomic late exception participants', () => {
    expect(snapshotSql).toMatch(
      /create or replace function public\.add_event_regear_exception_participant/i,
    )
    expect(snapshotSql).toMatch(
      /p_policy_version_id is distinct from v_event_policy_version_id/i,
    )
    expect(snapshotSql).toMatch(
      /insert into public\.event_regear_policy_snapshots[\s\S]*insert into public\.event_regear_participants/i,
    )
    expect(snapshotSql).toMatch(
      /guard_frozen_event_regear_participants[\s\S]*event_regear_participant_locked/i,
    )
    expect(effectivePolicyServer).toContain(
      ".rpc('add_event_regear_exception_participant'",
    )
  })

  it('keeps request-to-snapshot links tenant- and event-scoped', () => {
    expect(snapshotSql).toMatch(
      /create constraint trigger guard_regear_request_policy_snapshot_scope[\s\S]*deferrable initially deferred/i,
    )
    expect(snapshotSql).toMatch(
      /snapshot\.guild_id = v_guild_id[\s\S]*snapshot\.event_id = v_event_id[\s\S]*regear_policy_snapshot_scope_mismatch/i,
    )
  })

  it('keeps the snapshot table service-only', () => {
    expect(snapshotSql).toMatch(
      /alter table public\.event_regear_policy_snapshots enable row level security/i,
    )
    expect(snapshotSql).toMatch(
      /grant select, insert on public\.event_regear_policy_snapshots to service_role/i,
    )
    expect(snapshotSql).toMatch(
      /revoke update, delete on public\.event_regear_policy_snapshots from service_role/i,
    )
    expect(snapshotSql).not.toMatch(
      /grant .+ on public\.event_regear_policy_snapshots to (?:anon|authenticated)/i,
    )
    expect(snapshotSql).toMatch(
      /revoke all on function public\.start_event_with_regear_policy_snapshots[\s\S]*from public, anon, authenticated/i,
    )
  })

  it('locks every event-local policy input and replaces role overrides atomically', () => {
    expect(snapshotSql).toMatch(
      /guard_frozen_event_regear_party_inputs[\s\S]*event_regear_roster_locked/i,
    )
    expect(snapshotSql).toMatch(
      /guard_frozen_event_regear_role_overrides[\s\S]*event_regear_policy_locked/i,
    )
    expect(snapshotSql).toMatch(
      /guard_frozen_regear_window_policy[\s\S]*regear_window_policy_locked/i,
    )
    expect(snapshotSql).toMatch(
      /create or replace function public\.replace_event_regear_role_overrides[\s\S]*for update of event[\s\S]*delete from public\.event_regear_role_overrides[\s\S]*insert into public\.event_regear_role_overrides/i,
    )
    expect(snapshotSql).toMatch(
      /guard_event_regear_policy_snapshot_insert[\s\S]*event_regear_policy_version_mismatch/i,
    )
  })

  it('backfills and enforces a stable event/free_window/auto origin', () => {
    expect(originBackfillSql).toMatch(
      /when auto_generated then 'auto'[\s\S]*when event_id is not null then 'event'[\s\S]*else 'free_window'/i,
    )
    expect(originInvariantSql).toMatch(
      /create trigger set_regear_request_origin_type[\s\S]*before insert/i,
    )
    expect(originInvariantSql).toMatch(
      /alter column regear_origin_type set not null/i,
    )
    expect(originInvariantSql).toMatch(
      /regear_origin_type = 'free_window'[\s\S]*event_id is null/i,
    )
  })

  it('routes manual, free-window, and automatic claims through frozen policy data', () => {
    expect(manualRegearAction).toContain(
      'loadEventParticipantEffectivePolicy',
    )
    expect(manualRegearAction).toContain(
      'event_regear_policy_snapshot_id: frozenParticipantPolicy?.id ?? null',
    )
    expect(manualRegearAction).toContain("regear_origin_type: 'event'")
    expect(freeWindowAction).toMatch(
      /parseRegearPolicyConfigSnapshot\(\s*windowRow\.regear_policy_config_snapshot,\s*\)/,
    )
    expect(freeWindowAction).toContain("regear_origin_type: 'free_window'")
    expect(autoRegearSource).toContain(
      ".from('event_regear_policy_snapshots')",
    )
    expect(autoRegearSource).toContain(
      'frozenAutoPolicyByEventAndMember',
    )
    expect(autoRegearSource).toContain(
      ".rpc(\n          'create_auto_regear_request_with_policy_snapshot'",
    )
    expect(autoRegearSource).toContain(
      'p_event_regear_policy_snapshot_id: eventPolicySnapshotId',
    )
    expect(snapshotSql).toMatch(
      /create or replace function public\.create_auto_regear_request_with_policy_snapshot[\s\S]*snapshot\.discord_id = p_discord_id[\s\S]*event_regear_policy_snapshot_id/i,
    )
  })

  it('routes manual start adapters through the shared event-start application command', () => {
    expect(adminEventAction).toContain('executeEventStartApplicationCommand')
    expect(discordCommerceAdmin).toContain('prepareEventStartApplicationCommand')
    expect(automaticStart).toContain('startEventWithEffectiveRegearPolicies')
  })

  it('validates guest slot exclusions with the same rules used by the application', () => {
    expect(guestStartValidationSql).toMatch(
      /guest\.discord_id is not null[\s\S]*v_guest_regear_enabled[\s\S]*left join public\.event_guest_profiles/i,
    )
    expect(guestStartValidationSql).toMatch(
      /coalesce\(slot\.auto_regear_excluded, false\)[\s\S]*guest\.discord_id is not null as auto_excluded/i,
    )
  })

  it('closes interrupted cron runs when a lease expires', () => {
    expect(staleCronSql).toMatch(
      /create or replace function public\.expire_stale_cron_runs[\s\S]*status = 'failed'[\s\S]*error = 'lease-expired'/i,
    )
    expect(staleCronSql).toMatch(
      /v_previous_run_id[\s\S]*update public\.cron_runs[\s\S]*error = 'lease-expired'/i,
    )
  })

  it('includes the frozen policy identity in the cached member event tree', () => {
    expect(eventRenderSnapshot).toContain('regear_policy_version_id')
    expect(eventRenderSnapshot).toContain('regear_policy_snapshotted_at')
  })

  it('filters operational regear statistics by origin without changing participation statistics', () => {
    expect(statsAction).toContain(
      "regearQuery.eq('regear_origin_type', regearOriginFilter.value)",
    )
    expect(statsAction).toContain(
      "pendingRegearQuery.eq(",
    )
    const getEventStatsBody =
      eventStatsAction.match(
        /export async function getEventStats\(\)[\s\S]*?export async function getShopRegearStats/,
      )?.[0] ?? ''
    expect(getEventStatsBody).not.toContain("from('regear_requests')")
    expect(getEventStatsBody).not.toContain("from('regear_windows')")
  })
})
