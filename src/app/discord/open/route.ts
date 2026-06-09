import { NextRequest, NextResponse } from 'next/server'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'
import {
  isDiscordQuickStarterDestination,
  quickStarterDestinationPath,
} from '@/lib/discord-quick-starter'
import { getTenantDiscordConfigByDiscordGuildId } from '@/lib/tenant'
import { tenantUrl } from '@/lib/tenant-resolver'
import { log } from '@/lib/log'
import { withNoStore } from '@/lib/no-store-response'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DISCORD_GUILD_ID_PATTERN = /^\d{17,20}$/

function publicRedirect(path: string): NextResponse {
  return withNoStore(NextResponse.redirect(tenantUrl(null, path)))
}

function tenantRedirectUrl(slug: string, pathWithQuery: string): string {
  const base = tenantUrl(slug, '/')
  try {
    return new URL(pathWithQuery, base.endsWith('/') ? base : `${base}/`).toString()
  } catch {
    return tenantUrl(slug, pathWithQuery)
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const destination = url.searchParams.get('dest')

  if (!isDiscordQuickStarterDestination(destination)) {
    return publicRedirect('/faq')
  }

  if (destination === 'guide') {
    return publicRedirect('/member-quick-guide.html')
  }

  const discordGuildId = url.searchParams.get('guild')?.trim() ?? ''
  if (!DISCORD_GUILD_ID_PATTERN.test(discordGuildId)) {
    return publicRedirect('/faq')
  }

  try {
    const tenant = await getTenantDiscordConfigByDiscordGuildId(discordGuildId)
    if (!tenant) return publicRedirect('/faq')

    const targetPath =
      destination === 'verify'
        ? buildDiscordStartHref({
            returnTo: '/onboarding/albion',
            forceConsent: true,
          })
        : quickStarterDestinationPath(destination)

    return withNoStore(NextResponse.redirect(tenantRedirectUrl(tenant.slug, targetPath)))
  } catch (error) {
    log.warn('[discord/open] tenant resolution failed', {
      discord_guild_id: discordGuildId,
      destination,
      error: error instanceof Error ? error.message : String(error),
    })
    return publicRedirect('/faq')
  }
}
