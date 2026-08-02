import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/345_guild_feature_state_catalog.sql'),
  'utf8',
)

describe('migration 345 guild feature state catalog', () => {
  it('keeps battlelog outside the customer feature catalog', () => {
    const keyConstraint = sql.match(
      /guild_feature_states_key_check[\s\S]*?\)\),/i,
    )?.[0] ?? ''
    expect(keyConstraint).not.toContain('battle')
    expect(keyConstraint).not.toContain('killbot')
  })

  it('backfills existing tenants and initializes future tenants', () => {
    expect(sql).toContain("select public.initialize_guild_feature_states(tenant.id, true)")
    expect(sql).toMatch(
      /create trigger tenants_initialize_guild_feature_states[\s\S]*after insert on public\.tenants/i,
    )
    expect(sql).toMatch(
      /when p_existing_tenant and seed\.feature_key in[\s\S]*'guild_economy'[\s\S]*then 'enabled'/i,
    )
  })

  it('blocks intake in the database and finalizes draining from work tables', () => {
    expect(sql).toContain('create or replace function public.guard_guild_feature_intake()')
    expect(sql).toContain('create or replace function public.finalize_guild_feature_from_row()')
    expect(sql).toContain("('regear_requests', 'supply')")
    expect(sql).toContain("('shop_orders', 'guild_shop')")
    expect(sql).toContain("('member_trade_orders', 'member_market')")
  })

  it('allows only service-role commands and keeps internal helpers private', () => {
    expect(sql).toMatch(
      /revoke all on table public\.guild_feature_states[\s\S]*from public, anon, authenticated, service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.change_guild_feature_state[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.guild_feature_has_open_work[\s\S]*from public, anon, authenticated, service_role/i,
    )
  })

  it('uses one transactional command for dependencies, draining, legacy projection, and audit', () => {
    const command = sql.match(
      /create or replace function public\.change_guild_feature_state[\s\S]*?\n\$\$;/i,
    )?.[0] ?? ''
    expect(command).toContain('FEATURE_DEPENDENCY_REQUIRED:guild_economy')
    expect(command).toContain('FEATURE_DEPENDENTS_ACTIVE')
    expect(command).toContain("v_next_state := 'draining'")
    expect(command).toContain("'operator_command'")
    expect(command).toContain("'regear_support_enabled'")
    expect(command).toContain("'tactics_experimental_enabled'")
    expect(command).toContain("'guild_profile_enabled'")
  })
})
