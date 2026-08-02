import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  getValidatedTestSupabaseEnv,
  hasTestEnv,
} from '@/test/integration-helpers'

const anonKey = process.env.TEST_SUPABASE_ANON_KEY?.trim() ?? ''
const describeIntegration = hasTestEnv() && anonKey ? describe : describe.skip

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

describeIntegration('internal battle shadow RLS', () => {
  it('keeps service-role reads working while denying anon and authenticated clients', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return

    const service = getTestServiceClient()
    const anonymous = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })
    const authenticated = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })
    const email = `shadow-rls-${crypto.randomUUID()}@example.test`
    const password = `Rls-${crypto.randomUUID()}-Aa1!`
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    expect(created.error).toBeNull()
    expect(created.data.user).not.toBeNull()

    try {
      const signIn = await authenticated.auth.signInWithPassword({ email, password })
      expect(signIn.error).toBeNull()

      for (const table of INTERNAL_TABLES) {
        const serviceRead = await service
          .from(table)
          .select('*')
          .limit(1)
        expect(serviceRead.error, table).toBeNull()

        const anonRead = await anonymous
          .from(table)
          .select('*')
          .limit(1)
        expect(anonRead.error, table).not.toBeNull()
        expect(anonRead.error?.code, table).toBe('42501')

        const authenticatedRead = await authenticated
          .from(table)
          .select('*')
          .limit(1)
        expect(authenticatedRead.error, table).not.toBeNull()
        expect(authenticatedRead.error?.code, table).toBe('42501')
      }
    } finally {
      if (created.data.user) {
        await service.auth.admin.deleteUser(created.data.user.id)
      }
    }
  })

  it('does not expose table-trigger functions as direct RPCs to any API role', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return

    const service = getTestServiceClient()
    const anonymous = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })

    for (const functionName of INTERNAL_TRIGGER_FUNCTIONS) {
      const [serviceCall, anonymousCall] = await Promise.all([
        service.rpc(functionName),
        anonymous.rpc(functionName),
      ])
      expect(serviceCall.error, functionName).not.toBeNull()
      expect(anonymousCall.error, functionName).not.toBeNull()
      expect(serviceCall.data, functionName).toBeNull()
      expect(anonymousCall.data, functionName).toBeNull()
    }
  })
})
