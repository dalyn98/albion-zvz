import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/325_tenant_lifecycle_schema.sql'),
  'utf8',
)
const commandSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/326_tenant_lifecycle_commands.sql'),
  'utf8',
)
const capabilitySql = readFileSync(
  join(process.cwd(), 'supabase/migrations/327_workspace_delete_capability.sql'),
  'utf8',
)
const policySql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/328_tenant_policy_suspension_command.sql',
  ),
  'utf8',
)

describe('tenant lifecycle migration contract', () => {
  it('separates preservation suspension from explicit delayed deletion', () => {
    expect(schemaSql).toContain("'deletion_pending'")
    expect(schemaSql).toContain("'bot_removed'")
    expect(schemaSql).toContain("'inactive'")
    expect(schemaSql).toContain(
      "purge_at >= deletion_requested_at + interval '30 days'",
    )
    expect(commandSql).toContain(
      "v_purge_at := v_now + interval '30 days'",
    )
    const suspensionCommand = commandSql
      .split('create or replace function public.suspend_tenant_for_bot_removal')[1]
      ?.split(
        'create or replace function public.tenant_deletion_obligations',
      )[0]
    expect(suspensionCommand).not.toContain('v_purge_at')
  })

  it('keeps lifecycle commands service-only and internal helpers unreachable', () => {
    for (const command of [
      'tenant_activation_readiness',
      'restore_tenant_after_bot_install',
      'suspend_tenant_for_bot_removal',
      'tenant_deletion_obligations',
      'request_tenant_deletion',
      'cancel_tenant_deletion',
      'claim_due_tenant_deletions',
      'release_tenant_deletion_claim',
      'finalize_tenant_purge',
    ]) {
      expect(commandSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${command}[\\s\\S]*?anon, authenticated`,
        ),
      )
      expect(commandSql).toMatch(
        new RegExp(
          `grant execute on function public\\.${command}[\\s\\S]*?service_role`,
        ),
      )
    }

    expect(policySql).toMatch(
      /revoke all on function public\.set_tenant_policy_suspension[\s\S]*?anon, authenticated/,
    )
    expect(policySql).toMatch(
      /grant execute on function public\.set_tenant_policy_suspension[\s\S]*?service_role/,
    )

    for (const internal of [
      'tenant_activation_blocker',
      'capture_tenant_session_revocation',
      'guard_tenant_deletion_pending_delete',
    ]) {
      expect(commandSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${internal}[\\s\\S]*?service_role`,
        ),
      )
    }
  })

  it('keeps operator suspension separate from onboarding and deletion states', () => {
    expect(policySql).toContain(
      "v_tenant.status in ('deletion_pending', 'deleted')",
    )
    expect(policySql).toContain(
      "v_tenant.status <> 'active'",
    )
    expect(policySql).toContain(
      "v_tenant.lifecycle_reason <> 'policy'",
    )
    expect(policySql).toContain(
      'public.tenant_activation_blocker(p_guild_id)',
    )
    expect(policySql).toContain(
      "last_error = 'tenant_policy_suspended'",
    )
    expect(policySql).not.toContain(
      "set bot_installed_at = null",
    )
  })

  it('blocks deletion while obligations remain and preserves other guild identities', () => {
    for (const obligationTable of [
      'point_escrows',
      'member_trade_orders',
      'member_trade_price_offers',
      'shop_orders',
      'exchange_requests',
      'donation_requests',
      'regear_requests',
      'craft_tasks',
      'craft_orders',
      'event_payout_requests',
    ]) {
      expect(commandSql).toContain(`from public.${obligationTable}`)
    }
    expect(commandSql).toContain(
      'WORKSPACE_DELETE_BLOCKED_OPEN_OBLIGATIONS',
    )
    expect(commandSql).toContain("'scope', 'tenant_only'")
    expect(commandSql).not.toContain(
      'delete from public.account_albion_profiles',
    )
    expect(commandSql).not.toContain('delete from public.discord_accounts')
  })

  it('requires recent reauth, exact name and irreversible confirmation', () => {
    expect(commandSql).toContain(
      "p_actor_authenticated_at < v_now - interval '10 minutes'",
    )
    expect(commandSql).toContain(
      'p_expected_guild_name is distinct from v_tenant.name',
    )
    expect(commandSql).toContain(
      'p_confirm_irreversible is distinct from true',
    )
    expect(commandSql).toContain(
      'p_confirm_restore is distinct from true',
    )
  })

  it('guards direct deletion and requires a claimed, receipt-backed purge', () => {
    expect(commandSql).toContain(
      'TENANT_DELETE_REQUIRES_PURGE_CLAIM',
    )
    expect(commandSql).toContain(
      "'app.tenant_purge_claim_token'",
    )
    expect(commandSql).toContain('PURGE_CLAIM_INVALID')
    expect(commandSql).toContain('INVALID_PURGE_STORAGE_RECEIPT')
    expect(commandSql).toMatch(
      /set_config\([\s\S]*delete from public\.tenants[\s\S]*status = 'purged'/,
    )
    expect(commandSql).toMatch(
      /set guild_id = null,[\s\S]*requested_by = null,[\s\S]*request_reason = null,[\s\S]*purge_receipt = v_receipt/,
    )
    expect(commandSql).toContain("'scope', 'tenant_only'")
  })

  it('reserves capability bit 36 for workspace deletion', () => {
    expect(capabilitySql).toContain('WORKSPACE_DELETE')
    expect(capabilitySql).toContain('137438953471')
    expect(capabilitySql).toContain(
      "'apply_permission_role_grant'",
    )
    expect(capabilitySql).toContain(
      "'apply_permission_user_override'",
    )
  })
})
