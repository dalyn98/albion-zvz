import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/359_close_remaining_internal_acl_gaps.sql',
  ),
  'utf8',
)

const INTERNAL_TABLES = [
  'albion_registry_entities',
  'albion_registry_entity_names',
  'battle_record_snapshots',
  'battle_participant_snapshots',
  'battle_view_projections',
  'battle_projection_diffs',
] as const

const INTERNAL_TRIGGER_FUNCTIONS = [
  'capture_event_tentative_snapshot',
  'guard_regear_request_policy_snapshot_scope',
  'sync_member_gameplay_video_from_participation',
  'guard_event_regear_policy_snapshot_insert',
  'guard_event_tentative_signup_recruitment',
  'guard_event_tentative_snapshot_insert',
  'guard_frozen_event_regear_config',
  'guard_frozen_event_regear_participants',
  'guard_frozen_event_regear_party_inputs',
  'guard_frozen_event_regear_role_overrides',
  'guard_frozen_event_regear_slot_inputs',
  'guard_frozen_regear_window_policy',
  'prepare_event_tentative_snapshot',
  'set_member_operations_updated_at',
  'set_regear_request_origin_type',
  'touch_tactic_board_step_revision',
  'bump_build_catalog_event_revisions',
  'bump_event_revision_from_direct_children',
  'bump_event_revision_from_slots',
  'bump_event_row_state_revision',
  'bump_party_slots_version',
  'capture_permission_role_legacy_projection',
  'check_solo_bomb_slot',
  'cleanup_tentative_on_slot_fill',
  'dual_write_account_albion_tenant_link_member_record',
  'dual_write_guild_avatar_member_record',
  'dual_write_local_guild_account_member_record',
  'enforce_regear_craft_task_support_delete',
  'enforce_regear_craft_task_support_write',
  'enforce_regear_support_delete',
  'enforce_regear_support_write',
  'normalize_shop_inventory_quality',
  'set_build_sheet_recruitment_updated_at',
  'set_event_regear_participants_updated_at',
  'set_event_tentative_signups_updated_at',
  'set_guild_local_accounts_updated_at',
  'set_loot_audit_updated_at',
  'shop_inventory_delete_when_empty',
  'sync_member_point_balance_from_ledger',
] as const

describe('internal shadow RLS migration', () => {
  it.each(INTERNAL_TABLES)('enables RLS and removes browser-role privileges: %s', (table) => {
    expect(sql).toMatch(
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    )
    expect(sql).toMatch(
      new RegExp(
        `revoke all on table public\\.${table}\\s+from public, anon, authenticated`,
        'i',
      ),
    )
    expect(sql).toMatch(
      new RegExp(
        `grant select, insert, update, delete\\s+on table public\\.${table} to service_role`,
        'i',
      ),
    )
  })

  it('does not add browser policies or alter battle data', () => {
    expect(sql).not.toMatch(/create\s+policy/i)
    expect(sql).not.toMatch(/\b(insert into|update|delete from)\s+public\./i)
    expect(sql).not.toMatch(/force\s+row\s+level\s+security/i)
  })

  it.each(INTERNAL_TRIGGER_FUNCTIONS)(
    'removes direct execution from the internal trigger function: %s',
    (functionName) => {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\(\\)\\s+from public, anon, authenticated, service_role`,
          'i',
        ),
      )
    },
  )
})
