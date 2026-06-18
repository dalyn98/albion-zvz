import { after, NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildBotInstallUrl } from '@/lib/discord'
import { shouldUseDiscordInstallBridge } from '@/lib/discord-install-bridge'
import { recordAuthStart } from '@/lib/auth-telemetry'
import { recordSeoAttributionEventFromRequest } from '@/lib/seo-attribution'
import { withNoStore } from '@/lib/no-store-response'

// 봇 설치 흐름의 시작점. /onboard 의 길드 목록에서 "봇 설치" 를 누르면 이쪽으로
// 들어와 Discord OAuth 봇 설치 동의 화면으로 redirect 한다.
//
// 원래 server action (startBotInstall) 이 cookie + redirect 로 처리했는데
// Next.js server action 의 외부 redirect 응답은 Set-Cookie 가 일관되지 않아
// state cookie 가 사라지고 무한 루프가 발생했다. route handler 로 옮기면
// NextResponse.redirect 로 직접 응답을 만들어 안정적이다.
//
// state 값 자체는 random UUID 로 그대로 넘기지만, Discord 가 disable_guild_select
// + bot scope 단독 조합에서 state 를 echo 하지 않는 사례가 확인됨 — 그래서
// bot-callback 의 state 검증은 같이 제거하고, session + guildId snowflake 포맷
// + Discord API 길드 존재 확인 (getDiscordGuild) 으로 무결성을 보장한다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const guildId = url.searchParams.get('guild_id')

  const session = await getSession()
  if (!session) {
    return withNoStore(
      NextResponse.redirect(
        new URL('/api/auth/discord/start?returnTo=/onboard', url.origin),
      ),
    )
  }

  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    return withNoStore(NextResponse.redirect(new URL('/onboard', url.origin)))
  }

  const bridge = shouldUseDiscordInstallBridge(request.headers.get('user-agent'))
  recordAuthStart(request, 'bot_install', {
    bridge,
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

  const state = crypto.randomUUID()
  const installUrl = buildBotInstallUrl({ guildId, state })
  return withNoStore(NextResponse.redirect(installUrl))
}
