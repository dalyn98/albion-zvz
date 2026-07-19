import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('cross-request configuration caches', () => {
  it('caches app settings by tenant with a tenant-specific invalidation tag', () => {
    const source = read('src/lib/app-settings.ts')

    expect(source).toContain('unstable_cache')
    expect(source).toContain('appSettingsCacheTag(guildId)')
    expect(source).toMatch(/revalidate:\s*60/)
  })

  it('invalidates the current tenant settings immediately after admin writes', () => {
    const source = read('src/app/actions/settings.ts')

    expect(source).toContain('invalidateAppSettingsCache(guildId)')
    expect(source).toContain('invalidateAppSettingsCache(sessionGuildId)')

    for (const path of [
      'src/app/actions/local-guild-account.ts',
      'src/app/actions/onboard.ts',
      'src/app/actions/craft-admin.ts',
      'src/app/actions/guild-profile.ts',
      'src/app/actions/discord-quick-starter-panel.ts',
      'src/app/actions/notice-image.ts',
      'src/app/actions/landing-banner.ts',
    ]) {
      expect(read(path), path).toContain('invalidateAppSettingsCache(')
    }

    const craftAdmin = read('src/app/actions/craft-admin.ts')
    const craftSettingsWriter = craftAdmin.slice(
      craftAdmin.indexOf('export async function updateCraftSettingsAdmin'),
    )
    expect(craftSettingsWriter).toContain('invalidateAppSettingsCache(guildId)')
  })

  it('revalidates cached settings after non-action operational writes', () => {
    for (const path of [
      'src/lib/member-sync.ts',
      'src/lib/admin-notifications.ts',
      'src/lib/discord-commands.ts',
      'src/app/api/cron/killboard-sync/route.ts',
      'src/app/api/cron/auto-regear/route.ts',
      'src/app/api/cron/battle-tracker/route.ts',
    ]) {
      expect(read(path), path).toContain('revalidateAppSettingsCache(')
    }
  })

  it('caches tenant slug and Discord configuration lookups across requests', () => {
    const resolver = read('src/lib/tenant-resolver.ts')
    const tenant = read('src/lib/tenant.ts')

    expect(resolver).toContain('unstable_cache')
    expect(resolver).toContain('TENANT_DIRECTORY_CACHE_TAG')
    expect(tenant).toContain('unstable_cache')
    expect(tenant).toContain('TENANT_DIRECTORY_CACHE_TAG')
  })

  it('invalidates tenant directory reads on onboarding and status changes', () => {
    expect(read('src/app/actions/onboard.ts')).toContain('invalidateTenantDirectoryCache()')
    expect(read('src/app/api/auth/discord/bot-callback/route.ts')).toContain(
      'revalidateTenantDirectoryCache()',
    )
    expect(read('src/app/super-admin/actions.ts')).toContain('invalidateTenantDirectoryCache()')
  })

  it('keeps session and revocation authority outside cross-request caches', () => {
    const session = read('src/lib/session.ts')

    expect(session).not.toContain('unstable_cache')
  })
})
