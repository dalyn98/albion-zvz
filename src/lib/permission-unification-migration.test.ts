import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const expansion = readFileSync(
  new URL(
    '../../supabase/migrations/305_permission_unification_expand.sql',
    import.meta.url,
  ),
  'utf8',
)
const backfill = readFileSync(
  new URL(
    '../../supabase/migrations/306_permission_unification_backfill.sql',
    import.meta.url,
  ),
  'utf8',
)
const contract = readFileSync(
  new URL(
    '../../supabase/migrations/307_permission_unification_contract.sql',
    import.meta.url,
  ),
  'utf8',
)
const permissionActions = readFileSync(
  new URL('../app/actions/permissions.ts', import.meta.url),
  'utf8',
)
const settingsActions = readFileSync(
  new URL('../app/actions/settings.ts', import.meta.url),
  'utf8',
)
const onboardingActions = readFileSync(
  new URL('../app/actions/onboard.ts', import.meta.url),
  'utf8',
)
const discordCommands = readFileSync(
  new URL('./discord-command-commerce-admin.ts', import.meta.url),
  'utf8',
)

function functionBody(sql: string, name: string, nextName?: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`)
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}`, start + 1)
    : sql.length
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('Discord role permission unification contract', () => {
  it('expands role snapshots and time-bounded, auditable user exceptions first', () => {
    expect(expansion).toMatch(
      /permission_role_grants[\s\S]*add column if not exists discord_role_name text/i,
    )
    for (const column of [
      'reason',
      'expires_at',
      'revoked_at',
      'revoked_by_discord_id',
      'revoked_reason',
    ]) {
      expect(expansion).toContain(`add column if not exists ${column}`)
    }
    expect(expansion).toMatch(
      /permission_user_overrides_active_expiry_idx[\s\S]*where revoked_at is null/i,
    )
  })

  it('backfills every legacy admin, event-creator, and caller meaning into capability rows', () => {
    expect(backfill).toContain('tenants.admin_role_ids')
    expect(backfill).toContain('17179869184::bigint')
    expect(backfill).toContain("'event_creator_role_ids_combat'")
    expect(backfill).toContain("'event_creator_role_ids_ff'")
    expect(backfill).toContain("'event_creator_role_ids_ganking'")
    expect(backfill).toContain("'bomb_squad_caller_role_ids'")
    expect(backfill).toContain('32::bigint')
    expect(backfill).toContain('64::bigint')
    expect(backfill).toContain('128::bigint')
    expect(backfill).toContain('131072::bigint')
    expect(backfill).toMatch(/discord_role_id !~ '\^\[0-9\]\{17,20\}\$'/)
    expect(backfill).toContain("'system:permission-unification'")
    expect(backfill).toContain("'permission.role.delete'")
    expect(backfill).toMatch(
      /least\([\s\S]*expires_at[\s\S]*clock_timestamp\(\) \+ interval '30 days'/i,
    )
  })

  it('keeps legacy arrays as write-through projections, not a competing authority', () => {
    const projection = functionBody(
      contract,
      'sync_permission_role_legacy_projection',
      'capture_permission_role_legacy_projection',
    )
    expect(projection).toContain('from public.permission_role_grants')
    expect(projection).toContain('update public.tenants')
    expect(projection).toContain("'event_creator_role_ids_combat'")
    expect(projection).toContain("'bomb_squad_caller_role_ids'")
    expect(contract).toMatch(
      /create trigger permission_role_grants_legacy_projection[\s\S]*after insert or delete or update of capabilities, discord_role_id/i,
    )
    expect(contract).toContain('sync_legacy_permission_roles_to_grants')
    expect(contract).toContain('tenants_legacy_permission_roles_to_grants')
    expect(contract).toContain('app_settings_legacy_permission_roles_to_grants')
    expect(contract).toContain('pg_trigger_depth() > 1')
    const captureProjection = functionBody(
      contract,
      'capture_permission_role_legacy_projection',
      'sync_legacy_permission_roles_to_grants',
    )
    expect(captureProjection).toContain('pg_trigger_depth() > 1')
    expect(captureProjection).toMatch(
      /not exists \([\s\S]*from public\.tenants where id = v_guild_id/i,
    )
    expect(contract).toContain("'tenants.admin_role_ids'")
    expect(contract).toContain("'app_settings.' || v_key")

    const eventCategoryBody = discordCommands.slice(
      discordCommands.indexOf('export async function eventCreatorCategories'),
      discordCommands.indexOf('async function canCreateEventCategory'),
    )
    expect(eventCategoryBody).toContain('actor.capabilities')
    expect(eventCategoryBody).not.toContain('event_creator_role_ids')
    expect(eventCategoryBody).not.toContain('getAppSetting')
    expect(settingsActions).not.toMatch(
      /EDITABLE_KEYS[\s\S]{0,1200}event_creator_role_ids/,
    )
  })

  it('serializes role changes with optimistic locking and one audited command', () => {
    const roleCommand = functionBody(
      contract,
      'apply_permission_role_grant',
      'replace_onboarding_permission_admin_roles',
    )
    expect(roleCommand).toContain('pg_advisory_xact_lock')
    expect(roleCommand).toContain('PERMISSION_ROLE_CONFLICT')
    expect(roleCommand).toContain('p_expected_updated_at')
    expect(roleCommand).toContain("'beforeCapabilities'")
    expect(roleCommand).toContain("'afterCapabilities'")
    expect(roleCommand).toContain("'affectedMemberCount'")
    expect(contract).toMatch(
      /revoke all on function public\.apply_permission_role_grant[\s\S]*from public, anon, authenticated/i,
    )
    expect(contract).toMatch(
      /grant execute on function public\.apply_permission_role_grant[\s\S]*to service_role/i,
    )
    expect(permissionActions).toContain(
      "db.rpc('apply_permission_role_grant'",
    )
    expect(permissionActions).toContain('role.memberCount')
  })

  it('limits personal overrides to current Discord users, a reason, and 15m–30d expiry', () => {
    const overrideCommand = functionBody(
      contract,
      'apply_permission_user_override',
    )
    expect(overrideCommand).toContain(
      "coalesce(p_discord_id, '') !~ '^[0-9]{17,20}$'",
    )
    expect(overrideCommand).toContain("interval '15 minutes'")
    expect(overrideCommand).toContain("interval '30 days'")
    expect(overrideCommand).toContain(
      '(p_capabilities_granted & 17179869184::bigint) <> 0',
    )
    expect(overrideCommand).toContain('PERMISSION_OVERRIDE_CONFLICT')
    expect(overrideCommand).toContain("'permission.user.revoke'")
    expect(overrideCommand).toContain("'beforeGranted'")
    expect(overrideCommand).toContain("'afterGranted'")
    expect(contract).toMatch(
      /update of[\s\S]*expires_at,[\s\S]*revoked_at[\s\S]*capture_tenant_session_revocation/i,
    )
    expect(permissionActions).toContain('target.user.bot')
    expect(permissionActions).toContain('targetRoleBits & CAP.GUILD_ADMIN')
    expect(permissionActions).toContain('isBootstrapAdmin')
    expect(permissionActions).toContain('MAX_OVERRIDE_DAYS')
    expect(permissionActions).toContain(
      "db.rpc('apply_permission_user_override'",
    )
  })

  it('gives self-serve onboarding the same role authority without direct legacy writes', () => {
    const onboardingCommand = functionBody(
      contract,
      'replace_onboarding_permission_admin_roles',
      'apply_permission_user_override',
    )
    expect(onboardingCommand).toContain('created_by_discord_id = p_actor_discord_id')
    expect(onboardingCommand).toContain('public.permission_role_grants')
    expect(onboardingCommand).toContain('17179869184::bigint')
    expect(onboardingCommand).toContain(
      'perform public.sync_permission_role_legacy_projection',
    )
    expect(onboardingCommand).toContain("'self_serve_onboarding'")
    expect(onboardingActions).toMatch(
      /db\.rpc\(\s*'replace_onboarding_permission_admin_roles'/,
    )
    expect(onboardingActions).not.toMatch(
      /\.update\(\s*\{\s*admin_role_ids:/,
    )
  })
})
