import { after, NextRequest, NextResponse } from 'next/server'
import { buildOpenBotInstallUrl } from '@/lib/discord'
import { shouldUseDiscordInstallBridge } from '@/lib/discord-install-bridge'
import { recordAuthStart } from '@/lib/auth-telemetry'
import { recordSeoAttributionEventFromRequest } from '@/lib/seo-attribution'
import { withNoStore } from '@/lib/no-store-response'
import { signBotInstallState } from '@/lib/oauth-state'
import {
  botInstallIntentCookieName,
  botInstallIntentCookieOptions,
  buildCanonicalAuthBindingBridgeUrl,
} from '@/lib/auth-flow-cookie'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const continueInstall = url.searchParams.get('continue') === '1'
  const bridge =
    !continueInstall &&
    shouldUseDiscordInstallBridge(request.headers.get('user-agent'))
  const flowId = crypto.randomUUID()
  recordAuthStart(request, 'open_bot_install', { bridge, flow_id: flowId })
  after(async () => {
    await recordSeoAttributionEventFromRequest(request, {
      eventType: 'bot_install_start',
      target: '/invite',
    })
  })

  if (bridge) {
    return withNoStore(NextResponse.redirect(new URL('/invite/open', url.origin)))
  }

  const state = await signBotInstallState({
    expectedGuildId: null,
    mode: 'open',
    originHost: request.headers.get('host') ?? url.host,
    nonce: flowId,
  })
  const bindingBridge = buildCanonicalAuthBindingBridgeUrl(request.url, {
    kind: 'bot',
    state,
  })
  const response = NextResponse.redirect(
    bindingBridge ?? buildOpenBotInstallUrl({ state }),
  )
  response.headers.set('referrer-policy', 'no-referrer')
  if (!bindingBridge) {
    response.cookies.set(
      botInstallIntentCookieName(flowId),
      state,
      botInstallIntentCookieOptions(request.headers.get('host')),
    )
  }
  return withNoStore(response)
}
