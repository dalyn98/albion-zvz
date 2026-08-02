import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('guild feature product boundary', () => {
  it('uses one snapshot for navigation and direct-route enforcement', () => {
    expect(source('src/components/AppShell.tsx')).toContain('loadGuildFeatureSnapshot(guildId)')
    const sidebar = source('src/components/AppSidebar.tsx')
    expect(sidebar).toContain('featureKey?: ConfigurableGuildFeatureKey')
    expect(sidebar).toContain('isGuildFeatureDiscoverable(guildFeatureSnapshot[i.featureKey].state)')
    const layout = source('src/app/(app-shell)/layout.tsx')
    expect(layout).toContain('resolveGuildFeatureForPathname(pathname)')
    expect(layout).toContain("isGuildFeatureUseAllowed(feature.state, 'read')")
  })

  it('filters shared home and request queues without hiding draining work', () => {
    expect(source('src/lib/app-shell-status.ts')).toContain(
      'loadMemberWorkInboxSnapshot(db, guildId, session.discordId',
    )
    expect(source('src/lib/admin-operations-data.ts')).toContain(
      'loadAdminWorkQueueSnapshot(guildId)',
    )
    expect(source('supabase/migrations/356_admin_work_queue_snapshot.sql'))
      .toContain("feature.state in ('enabled', 'draining')")
    const requests = source('src/app/(app-shell)/me/requests/page.tsx')
    expect(requests).toContain('loadMemberWorkInboxSnapshot(')
    expect(requests).not.toContain('listMyExchangeRequests()')
    expect(requests).not.toContain('listMyShopOrders(20)')
  })

  it('keeps regear history readable while intake and automation require enabled supply', () => {
    expect(source('src/lib/guild-features.ts')).toContain('isPreservedSupplyHistoryPath')
    expect(source('src/app/actions/regear.ts')).toContain('isRegearIntakeEnabled(guildId)')
    expect(source('src/app/actions/regear-tracked-deaths.ts')).toContain('isRegearIntakeEnabled(guildId)')
    expect(source('src/app/api/cron/auto-regear/route.ts')).toContain('isRegearIntakeEnabled(tenant.id)')
  })

  it('stops optional cron work and Discord intake when the catalog is disabled', () => {
    expect(source('src/app/api/cron/shop-price-sync/route.ts')).toContain(
      "getGuildFeature(tenant.id, 'guild_shop')",
    )
    expect(source('src/lib/discord-command-suite.ts')).toContain(
      'isRegearIntakeEnabled(input.tenant.id)',
    )
    expect(source('src/lib/discord-commands.ts')).toContain(
      'resolveGuildFeatureForDiscordCommand(path)',
    )
    expect(source('src/lib/discord-command-autocomplete.ts')).toContain(
      'checkGuildFeatureUse(tenant.id, featureBoundary)',
    )
    expect(source('src/lib/discord-application-command-confirmations.ts')).toContain(
      'resolveGuildFeatureForApplicationCommand(row.command_name)',
    )
    const notifications = source('src/lib/admin-notifications.ts')
    expect(notifications).toContain(
      'resolveGuildFeatureForAdminNotification(input.topic)',
    )
    expect(notifications).toContain('loadGuildFeatureSnapshot(tenant.id)')
  })

  it('does not add battlelog keys to the central catalog', () => {
    const catalog = source('src/lib/guild-features.ts')
    const keyBlock = catalog.slice(
      catalog.indexOf('GUILD_FEATURE_KEYS'),
      catalog.indexOf('] as const'),
    )
    expect(keyBlock).not.toContain('battle')
    expect(keyBlock).not.toContain('killbot')
  })
})
