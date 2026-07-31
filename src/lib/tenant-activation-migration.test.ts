import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/324_atomic_tenant_activation_contract.sql',
  ),
  'utf8',
)
const actionSource = readFileSync(
  join(process.cwd(), 'src/app/actions/onboard.ts'),
  'utf8',
)

describe('atomic tenant activation contract', () => {
  it('requires only the mandatory onboarding decisions', () => {
    for (const contract of [
      'ONBOARDING_BOT_REQUIRED',
      'ONBOARDING_ROLES_REQUIRED',
      'ONBOARDING_EVENT_CHANNEL_REQUIRED',
      'ONBOARDING_TIMEZONE_REQUIRED',
      'ONBOARDING_HOME_GUILD_REQUIRED',
      'ONBOARDING_REGEAR_SUPPORT_REQUIRED',
      'ONBOARDING_REGEAR_MODE_REQUIRED',
      'ONBOARDING_EVENT_START_REQUIRED',
    ]) {
      expect(migrationSql).toContain(contract)
    }
    for (const optionalSetting of [
      'tactics_enabled',
      'public_profile_enabled',
      'local_guild_accounts_enabled',
      'shop_enabled',
      'guide_completed',
    ]) {
      expect(migrationSql).not.toContain(`'${optionalSetting}'`)
    }
  })

  it('locks one owner-scoped tenant and exposes the command only to service role', () => {
    expect(migrationSql).toMatch(
      /from public\.tenants tenant[\s\S]*tenant\.id = p_guild_id[\s\S]*for update/,
    )
    expect(migrationSql).toContain(
      'v_tenant.created_by_discord_id is distinct from p_actor_discord_id',
    )
    expect(migrationSql).toMatch(
      /revoke all on function public\.activate_tenant_after_onboarding[\s\S]*anon, authenticated/,
    )
    expect(migrationSql).toMatch(
      /grant execute on function public\.activate_tenant_after_onboarding[\s\S]*service_role/,
    )
  })

  it('routes final onboarding through the database activation command', () => {
    expect(actionSource).toContain(
      "db.rpc(\n    'activate_tenant_after_onboarding'",
    )
    expect(actionSource).not.toMatch(
      /\.from\('tenants'\)[\s\S]{0,120}\.update\(\{ status: 'active' \}\)/,
    )
  })
})
