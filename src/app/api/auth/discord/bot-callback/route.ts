import { NextRequest, NextResponse } from 'next/server'
import { getSession, signSession, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session'
import { getDiscordGuild } from '@/lib/discord'
import { getAdminClient } from '@/lib/supabase-admin'

const BOT_INSTALL_STATE_COOKIE = 'discord_bot_install_state'
const BOT_INSTALL_GUILD_COOKIE = 'discord_bot_install_guild'
const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'

// 봇이 Discord 길드에 설치된 뒤 Discord 가 redirect 로 호출하는 엔드포인트.
// Query: guild_id=..., permissions=..., state=..., code=... (code 는 사용 안함 — 봇
// 설치 OAuth 는 user 토큰이 필요 없다)
//
// 1. state cookie 로 CSRF 방어
// 2. bot token 으로 해당 guild 를 조회해 "봇이 실제로 들어있는지" 확인
// 3. tenants row upsert, bot_installed_at + created_by_discord_id 세팅
// 4. 세션을 새 tenant 의 admin 으로 재발급 (초기 설정을 바로 할 수 있게)
// 5. /onboard/setup/[id] 로 리다이렉트

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/onboard', origin)
  url.searchParams.set('install_error', reason)
  const response = NextResponse.redirect(url)
  response.cookies.delete(BOT_INSTALL_STATE_COOKIE)
  response.cookies.delete(BOT_INSTALL_GUILD_COOKIE)
  return response
}

function slugifyGuildName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  // slug 충돌은 random suffix 로 분산. 최악의 경우에도 URL path 로 쓰는 용도라
  // 보안/정확성 요구사항은 없다.
  const suffix = Math.random().toString(36).slice(2, 6)
  return (base || 'guild') + '-' + suffix
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const discordError = url.searchParams.get('error')
  if (discordError) return errorRedirect(url.origin, 'denied')

  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/api/auth/discord/start?returnTo=/onboard', url.origin))
  }

  const guildId = url.searchParams.get('guild_id')
  const returnedState = url.searchParams.get('state')
  if (!guildId || !returnedState) return errorRedirect(url.origin, 'invalid')

  const savedState = request.cookies.get(BOT_INSTALL_STATE_COOKIE)?.value
  const savedGuild = request.cookies.get(BOT_INSTALL_GUILD_COOKIE)?.value
  if (!savedState || savedState !== returnedState) {
    return errorRedirect(url.origin, 'state_mismatch')
  }
  if (savedGuild && savedGuild !== guildId) {
    // guild_id 가 바뀌었다면 공격 시그널. 원래 선택한 길드가 아니면 거부.
    return errorRedirect(url.origin, 'guild_mismatch')
  }

  try {
    // 봇이 실제로 길드에 들어있어야 한다. 들어있지 않으면 설치 실패 또는
    // 브라우저에서 도중 창을 닫은 경우.
    const guild = await getDiscordGuild(guildId)
    if (!guild) return errorRedirect(url.origin, 'bot_not_in_guild')

    const db = getAdminClient()
    // 이미 이 Discord 길드에 대한 tenant 가 있으면 재사용 — 재설치 시나리오.
    // created_by_discord_id 는 건드리지 않는다 (원래 설치자 보존).
    const { data: existing } = await db
      .from('tenants')
      .select('id, created_by_discord_id')
      .eq('discord_guild_id', guildId)
      .maybeSingle()

    let tenantId: string
    if (existing) {
      tenantId = existing.id as string
      await db
        .from('tenants')
        .update({
          name: guild.name,
          bot_installed_at: new Date().toISOString(),
          status: 'active',
        })
        .eq('id', tenantId)
    } else {
      const { data: inserted, error: insertError } = await db
        .from('tenants')
        .insert({
          discord_guild_id: guildId,
          slug: slugifyGuildName(guild.name),
          name: guild.name,
          status: 'active',
          bot_installed_at: new Date().toISOString(),
          created_by_discord_id: session.discordId,
        })
        .select('id')
        .single()
      if (insertError || !inserted) {
        console.error('[bot-callback] tenant insert failed', insertError)
        return errorRedirect(url.origin, 'server_error')
      }
      tenantId = inserted.id as string
    }

    // 설치자를 즉시 이 tenant 의 admin 세션으로 설정 — 설정 페이지에서 바로
    // 역할/채널을 저장할 수 있게. 재설치의 경우에도 원래 관리자라고 가정한다
    // (state cookie 를 들고 온 본인이 MANAGE_GUILD 로 봇 설치 승인을 했으므로).
    const newSession = await signSession({
      discordId: session.discordId,
      username: session.username,
      avatar: session.avatar,
      isMember: true,
      isAdmin: true,
      isGuest: false,
      canCreateEvents: true,
      eventScope: null,
      guildId: tenantId,
      issuedAt: Date.now(),
    })

    const response = NextResponse.redirect(new URL(`/onboard/setup/${tenantId}`, url.origin))
    response.cookies.set(SESSION_COOKIE_NAME, newSession, cookieOptions())
    response.cookies.delete(BOT_INSTALL_STATE_COOKIE)
    response.cookies.delete(BOT_INSTALL_GUILD_COOKIE)
    response.cookies.delete(ONBOARD_GUILDS_COOKIE)
    return response
  } catch (e) {
    console.error('[bot-callback]', e)
    return errorRedirect(url.origin, 'server_error')
  }
}
