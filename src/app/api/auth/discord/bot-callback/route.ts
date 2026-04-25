import { NextRequest, NextResponse } from 'next/server'
import { getSession, signSession, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session'
import { getDiscordGuild } from '@/lib/discord'
import { getAdminClient } from '@/lib/supabase-admin'
import { isValidTenantSlug } from '@/lib/tenant-resolver'
import { SLOT_ROLES } from '@/types'

const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'

// 봇이 Discord 길드에 설치된 뒤 Discord 가 redirect 로 호출하는 엔드포인트.
// Query: guild_id=..., permissions=..., code=... (state 는 Discord 가 bot scope +
// disable_guild_select 조합에서 echo 하지 않음 — 실측으로 확인됨)
//
// state 검증을 포기하는 대신 다음 세 가지로 무결성을 보장한다:
//   1. 세션 (iron-session) 이 있어야 한다 — 세션이 없으면 /api/auth/discord/start
//      로 회귀시켜 본인 인증 후 돌아오게 한다.
//   2. guild_id 가 Discord snowflake 포맷 (17–20자리 숫자) 이어야 한다.
//   3. 봇이 실제로 그 길드에 설치되어 있어야 한다 (getDiscordGuild) — 임의의
//      guild_id 를 끼워넣어도 봇이 들어있지 않으면 거부.
//
// 잔존 위협: 공격자가 자기 길드의 install 링크를 다른 사람한테 클릭시켜 그 사람을
// 자기 tenant 의 admin 으로 만들 수 있다. 그러나 victim 의 입장에서는 본인 자원이
// 아닌 attacker 의 길드 admin 이 될 뿐이고 그 admin 권한은 attacker 길드 안에서만
// 의미가 있어 실효적 피해가 없다 (멘헤라 SaaS 모델 자체가 "당신의 디스코드에
// 봇을 설치하면 당신이 관리자" 다).

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/onboard', origin)
  url.searchParams.set('install_error', reason)
  return NextResponse.redirect(url)
}

// guild.name 에서 slug 초안을 뽑는다. 반드시 isValidTenantSlug 를 통과해야 —
// 통과하지 못하면 `guild-<suffix>` 로 폴백. 충돌은 호출부 retry 로 처리.
// 제약: a-z0-9/hyphen, 2–32자, 선/후 하이픈 금지, 연속 하이픈 금지, reserved 제외.
function slugifyGuildName(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    // 비 ASCII (한글/한자 포함) 는 제거 — slug 는 DNS 호스트명으로 쓰이므로.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  const candidate = base.length > 0 ? `${base}-${suffix}` : `guild-${suffix}`
  if (isValidTenantSlug(candidate)) return candidate
  // base 가 reserved 와 정확히 일치하는 경우 등에 대비한 보수적 폴백.
  return `guild-${suffix}`
}

const MAX_SLUG_ATTEMPTS = 5

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const discordError = url.searchParams.get('error')
  if (discordError) return errorRedirect(url.origin, 'denied')

  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/api/auth/discord/start?returnTo=/onboard', url.origin))
  }

  const guildId = url.searchParams.get('guild_id')
  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    console.error('[bot-callback] invalid guild_id', { params: url.searchParams.toString() })
    return errorRedirect(url.origin, 'guild_id_missing')
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
      // 재설치: name/bot_installed_at 만 갱신. status 는 건드리지 않는다 —
      // 이미 active 면 active 유지 (라이브 사이트 영향 없음), pending 이면
      // 위저드 재진입이 자연스럽도록 pending 유지.
      await db
        .from('tenants')
        .update({
          name: guild.name,
          bot_installed_at: new Date().toISOString(),
        })
        .eq('id', tenantId)
    } else {
      // 신규 INSERT 는 status='pending'. 위저드 3단계 (saveTenantRewards) 가
      // status='active' 로 flip 해야 subdomain 해상도 (resolveTenantBySlug) 가
      // 이 tenant 를 인식한다. 위저드 중단 tenant 는 pending 상태로 남아
      // `{slug}.albion-guildmanager.com` 에 영향을 주지 않는다.
      //
      // slug 는 tenants.slug UNIQUE 제약을 받는다. 새 suffix 로 최대 5회
      // 재시도 — 실제 충돌 확률은 4^36 suffix space 에서 매우 낮지만 방어적.
      let tenantRow: { id: string } | null = null
      let lastInsertError: unknown = null
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const { data: inserted, error: insertError } = await db
          .from('tenants')
          .insert({
            discord_guild_id: guildId,
            slug: slugifyGuildName(guild.name),
            name: guild.name,
            status: 'pending',
            bot_installed_at: new Date().toISOString(),
            created_by_discord_id: session.discordId,
          })
          .select('id')
          .single()
        if (inserted && !insertError) {
          tenantRow = inserted as { id: string }
          break
        }
        lastInsertError = insertError
        // Postgres unique_violation code = 23505.
        const code = (insertError as { code?: string } | null)?.code
        if (code !== '23505') break
      }
      if (!tenantRow) {
        console.error('[bot-callback] tenant insert failed', lastInsertError)
        return errorRedirect(url.origin, 'server_error')
      }
      tenantId = tenantRow.id

      // 새 tenant 에 기본 role_rewards 8개 seed (silver=0 = "미설정, 리기어 차단").
      // onboarding 위저드 3단계에서 관리자가 실버 값을 채운다. 실패해도 tenant
      // 생성 자체는 성공한 상태이므로 에러 로그만 남기고 진행 — 위저드에서 upsert
      // 으로 다시 시도할 수 있다.
      const seedRows = SLOT_ROLES.map((role_name) => ({
        guild_id: tenantId,
        role_name,
        silver: 0,
        updated_at: new Date().toISOString(),
      }))
      const { error: seedError } = await db
        .from('role_rewards')
        .upsert(seedRows, { onConflict: 'guild_id,role_name' })
      if (seedError) {
        console.error('[bot-callback] role_rewards seed failed', seedError)
      }
    }

    // 설치자를 즉시 이 tenant 의 admin 세션으로 설정 — 설정 페이지에서 바로
    // 역할/채널을 저장할 수 있게. 재설치의 경우에도 원래 관리자라고 가정한다
    // (본인이 MANAGE_GUILD 로 봇 설치 승인을 한 시점이라).
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
    response.cookies.delete(ONBOARD_GUILDS_COOKIE)
    return response
  } catch (e) {
    console.error('[bot-callback]', e)
    return errorRedirect(url.origin, 'server_error')
  }
}
