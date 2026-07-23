import { after, NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildBotInstallUrl } from '@/lib/discord'
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

// 봇 설치 흐름의 시작점. /onboard 의 길드 목록에서 "봇 설치" 를 누르면 이쪽으로
// 들어와 Discord OAuth 봇 설치 동의 화면으로 redirect 한다.
//
// 원래 server action (startBotInstall) 이 cookie + redirect 로 처리했는데
// Next.js server action 의 외부 redirect 응답은 Set-Cookie 가 일관되지 않아
// state cookie 가 사라지고 무한 루프가 발생했다. route handler 로 옮기면
// NextResponse.redirect 로 직접 응답을 만들어 안정적이다.
//
// state 는 서명된 기대 guild id 와 flow id 를 담고, parent-domain HttpOnly
// intent cookie 에 원문을 보관한다. Discord 가 callback state 를 생략해도 token
// response 의 guild 로 intent 를 복구하고 기대값과 일치하는지 확인할 수 있다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const guildId = url.searchParams.get('guild_id')

  const session = await getSession()
  if (!session) {
    return withNoStore(
      NextResponse.redirect(
        new URL('/login?returnTo=%2Fonboard', url.origin),
      ),
    )
  }

  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    return withNoStore(NextResponse.redirect(new URL('/onboard', url.origin)))
  }

  const continueInstall = url.searchParams.get('continue') === '1'
  const bridge =
    !continueInstall &&
    shouldUseDiscordInstallBridge(request.headers.get('user-agent'))
  const flowId = crypto.randomUUID()
  recordAuthStart(request, 'bot_install', {
    bridge,
    flow_id: flowId,
    guild_id: guildId,
  })
  after(async () => {
    await recordSeoAttributionEventFromRequest(request, {
      eventType: 'bot_install_start',
      target: '/api/auth/discord/bot-install',
    })
  })

  if (bridge) {
    const bridgeUrl = new URL('/onboard/bot-install/open', url.origin)
    bridgeUrl.searchParams.set('guild_id', guildId)
    return withNoStore(NextResponse.redirect(bridgeUrl))
  }

  const state = await signBotInstallState({
    expectedGuildId: guildId,
    mode: 'guided',
    originHost: request.headers.get('host') ?? url.host,
    nonce: flowId,
  })
  const installUrl = buildBotInstallUrl({ guildId, state })
  const bindingBridge = buildCanonicalAuthBindingBridgeUrl(request.url, {
    kind: 'bot',
    state,
  })
  const response = NextResponse.redirect(bindingBridge ?? installUrl)
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
