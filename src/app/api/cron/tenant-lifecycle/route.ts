import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { getDiscordGuild } from '@/lib/discord'
import { log } from '@/lib/log'
import { listActiveTenants } from '@/lib/tenant'
import { processDueTenantPurges } from '@/lib/tenant-lifecycle-purge'
import { revalidateTenantDirectoryCache } from '@/lib/tenant-cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'tenant-lifecycle', leaseSeconds: 600 },
    async ({ db }) => {
      const tenants = await listActiveTenants()
      let checked = 0
      let suspended = 0
      let transientFailures = 0

      for (const tenant of tenants) {
        if (!tenant.botInstalled) continue
        checked += 1
        try {
          const discordGuild = await getDiscordGuild(
            tenant.discordGuildId,
          )
          // getDiscordGuild returns null only for a definite Discord 404.
          // Timeouts, rate limits and provider errors throw and must never
          // change lifecycle state.
          if (discordGuild) continue
          const { data, error } = await db.rpc(
            'suspend_tenant_for_bot_removal',
            {
              p_guild_id: tenant.id,
              p_observed_at: new Date().toISOString(),
            },
          )
          if (error) {
            transientFailures += 1
            log.error(
              '[tenant-lifecycle] bot-removal suspension failed',
              error,
            )
          } else if (data === true) {
            suspended += 1
          }
        } catch (error) {
          transientFailures += 1
          log.warn('[tenant-lifecycle] Discord reconciliation deferred', {
            reason:
              error instanceof Error ? error.message : 'discord_unavailable',
          })
        }
      }

      const purge = await processDueTenantPurges(db)
      if (suspended > 0 || purge.purged > 0) {
        revalidateTenantDirectoryCache()
      }
      return NextResponse.json({
        discord: {
          checked,
          suspended,
          transient_failures: transientFailures,
        },
        purge,
      })
    },
  )
}
