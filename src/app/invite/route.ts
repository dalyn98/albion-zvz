import { NextRequest, NextResponse } from 'next/server'
import { buildOpenBotInstallUrl } from '@/lib/discord'
import { shouldUseDiscordInstallBridge } from '@/lib/discord-install-bridge'
import { recordAuthStart } from '@/lib/auth-telemetry'
import { withNoStore } from '@/lib/no-store-response'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const bridge = shouldUseDiscordInstallBridge(request.headers.get('user-agent'))
  recordAuthStart(request, 'open_bot_install', { bridge })

  if (bridge) {
    return withNoStore(NextResponse.redirect(new URL('/invite/open', url.origin)))
  }

  return withNoStore(NextResponse.redirect(buildOpenBotInstallUrl({ state: crypto.randomUUID() })))
}
