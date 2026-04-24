import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import AppShell from '@/components/AppShell'
import AppGate from '@/components/AppGate'
import PublicShell from '@/components/PublicShell'
import AlbionOnboardingModal from '@/components/AlbionOnboardingModal'
import { ToastProvider } from '@/components/ToastProvider'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import { getMemberAlbionIdentity } from '@/lib/albion-identity'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'

// Routes that should render for anyone, even without a session. The proxy
// forwards the pathname via x-pathname so we can decide here without duplicating
// the matcher logic.
function isPublicPathname(pathname: string): boolean {
  return pathname.startsWith('/public/')
}

// Tenant 온보딩 경로: 로그인은 됐지만 아직 어떤 tenant 에도 속하지 않은
// 사용자가 봇을 설치하고 초기 설정을 하는 흐름. role 이 없으므로 layout 의
// gate 를 우회하고, 자체 페이지에서 session.discordId 로 검증한다.
function isOnboardPathname(pathname: string): boolean {
  return pathname === '/onboard' || pathname.startsWith('/onboard/')
}

// 이벤트 스코프 게스트가 접근 가능한 경로. 자기 이벤트 + welcome 외엔 모두
// 본인 이벤트로 리다이렉트된다. (API 라우트는 이 layout 으로 wrap 되지 않아
// 별도 제어 불변.)
function isAllowedForEventScope(pathname: string, eventScope: string): boolean {
  if (pathname === `/events/${eventScope}`) return true
  if (pathname.startsWith(`/events/${eventScope}/`)) return true
  if (pathname.startsWith('/welcome-language')) return true
  if (pathname.startsWith('/public/')) return true
  return false
}

// 알비온 온보딩 모달을 띄우지 않을 경로. 전용 온보딩 페이지 자체, 언어 선택,
// OAuth 콜백 중 등에서는 모달이 겹치거나 세션이 불완전할 수 있으므로 skip.
function skipAlbionOnboardingModal(pathname: string): boolean {
  if (pathname.startsWith('/onboarding/albion')) return true
  if (pathname.startsWith('/welcome-language')) return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/public/')) return true
  if (pathname === '/logout') return true
  return false
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('title'),
    description: t('description'),
    // robots.txt + next.config headers 와 3중 신호. 일부 크롤러는 HTML meta
    // 만 보고 일부는 HTTP header 만 본다. 추후 marketing 도메인 분리 시 그
    // 도메인만 index:true 로 오버라이드.
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: t('title'),
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1117',
}

// Hard-gate every page (except /api/* routes, which are not wrapped by this
// layout). Members pass through; guests (logged in with valid invite) pass
// through; everyone else sees the AppGate landing. The callback enforces that
// only these two classes of session can exist, so the check here is mostly
// defensive for stale cookies where a role was later revoked.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, session, headersList] = await Promise.all([
    getLocale(),
    getMessages(),
    getSession(),
    headers(),
  ])

  const pathname = headersList.get('x-pathname') ?? ''
  const isPublic = isPublicPathname(pathname)
  const isOnboard = isOnboardPathname(pathname)

  // Verify guests still exist in the DB so admin deletions take effect on the
  // next request rather than waiting for the 7-day cookie to expire. Public
  // routes skip this — anyone can see them regardless of session state.
  let guestRevoked = false
  if (!isPublic && session && !session.isMember && session.isGuest) {
    const guildId = await getSessionGuildId(session)
    const { data } = await getAdminClient()
      .from('guests')
      .select('discord_id')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (!data) guestRevoked = true
  }

  // 이벤트 스코프 게스트: 자신이 초대받은 이벤트 외 페이지 접근 시 redirect.
  // gate(AppGate) 가 발동하기 전에 먼저 실행해야 "로그인된 게스트" 가 다른
  // 페이지 URL 을 직접 치는 경로를 막는다.
  if (
    !isPublic &&
    session?.isGuest &&
    !guestRevoked &&
    session.eventScope &&
    !isAllowedForEventScope(pathname, session.eventScope)
  ) {
    redirect(`/events/${session.eventScope}`)
  }

  // 알비온 온보딩 강제: 멤버가 아직 서버를 고르지 않았으면 랜딩 위에 모달을
  // 덮는다. 리디렉트 대신 overlay 방식 — 로그인 직후 대문 페이지에서 바로
  // 인증할 수 있게. DB 1회 조회(부분 인덱스로 O(log N)).
  let onboardingModalProps: {
    discordNickname: string
    initialIdentity: Awaited<ReturnType<typeof getMemberAlbionIdentity>>
    homeGuildConfigured: boolean
  } | null = null
  if (
    !isPublic &&
    session?.isMember &&
    !skipAlbionOnboardingModal(pathname)
  ) {
    const guildId = await getSessionGuildId(session)
    const { data: avatarRow } = await getAdminClient()
      .from('guild_avatars')
      .select('albion_server, albion_verified_at')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle()

    // 관리자가 /admin/dashboard/settings 의 "미인증 길드원 접속 허용" 을 끈
    // 경우, 인증되지 않은 멤버를 /onboarding/albion 으로 강제 리디렉트. 관리자
    // 자신은 사이트 관리 접근권이 있어야 하므로 예외 — isAdmin 은 통과.
    if (!session.isAdmin && !avatarRow?.albion_verified_at) {
      const allowUnverified = await getAppSetting('allow_unverified_member_access', 'true', guildId)
      if (allowUnverified === 'false') {
        redirect('/onboarding/albion')
      }
    }

    if (!avatarRow?.albion_server) {
      const [identity, homeGuildId] = await Promise.all([
        getMemberAlbionIdentity(session.discordId, guildId),
        getAppSetting('albion_home_guild_id', '', guildId),
      ])
      onboardingModalProps = {
        discordNickname: session.username,
        initialIdentity: identity,
        homeGuildConfigured: homeGuildId.trim().length > 0,
      }
    }
  }

  // 온보딩 경로: 세션이 있으면 role 없이도 통과시킨다 (bot 설치 전). 세션이 아예
  // 없으면 여전히 gate — 로그인 유도. layout 하단에서 Public/App shell 분기.
  const locked =
    !isPublic &&
    !(isOnboard && session) &&
    (!session || (!session.isMember && !session.isGuest) || guestRevoked)

  let gateContent: React.ReactNode = null
  if (locked) {
    // 잠긴 상태 → 사용자는 비로그인/게스트인 경우가 많다. session 이 있으면 해당
    // tenant, 없으면 현재 요청 host 로 이미 해석된 tenant (layout 외부에서 resolve
    // 됨) — 그러나 여기선 명시적 host 컨텍스트가 없어 primary tenant fallback.
    const gateGuildId = session
      ? await getSessionGuildId(session)
      : await getPrimaryTenantId()
    const [bannerUrl, ctaText, tLanding, tAuthError] = await Promise.all([
      getAppSetting('landing_banner_url', '', gateGuildId),
      getAppSetting('landing_cta_text', '', gateGuildId),
      getTranslations('landing'),
      getTranslations('auth.error'),
    ])
    gateContent = (
      <AppGate
        reason={session ? 'no_role' : 'not_logged_in'}
        bannerUrl={bannerUrl}
        ctaText={ctaText || tLanding('defaultCta')}
        loginLabel={tLanding('discordLogin')}
        memberRequiredLabel={tLanding('memberRequired')}
        logoutLabel={tLanding('logout')}
        publicRecordsLabel={tLanding('publicRecords')}
        authErrorLabels={{
          denied: tAuthError('denied'),
          invalid: tAuthError('invalid'),
          stateMismatch: tAuthError('stateMismatch'),
          notInGuild: tAuthError('notInGuild'),
          noIdentity: tAuthError('noIdentity'),
          noRole: tAuthError('noRole'),
          serverError: tAuthError('serverError'),
          default: tAuthError('default'),
        }}
      />
    )
  }

  // Public routes: if the visitor has a real session, give them the normal
  // AppShell so the sidebar stays consistent; otherwise wrap in a minimal
  // PublicShell with a login CTA. 온보딩은 아직 어떤 길드에도 속하지 않은
  // 사용자라 AppSidebar 가 어색해서 PublicShell 로 통일.
  const body = locked
    ? gateContent
    : isOnboard
      ? <PublicShell>{children}</PublicShell>
      : isPublic && !session
        ? <PublicShell>{children}</PublicShell>
        : <AppShell>{children}</AppShell>

  return (
    <html lang={locale} className="h-full antialiased">
      <head>
        {/* Pretendard 가변 폰트. jsdelivr CDN 에 별도 preconnect 해두면
            TLS/DNS 가 CSS 다운로드 전에 끝난다. stylesheet 는 render-blocking
            이지만 globals.css 와 병렬로 받아오므로 globals 내부 @import 보다
            빠르다 (~200ms 체감). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body className="min-h-full bg-[#0f1117] text-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            {body}
            {onboardingModalProps && <AlbionOnboardingModal {...onboardingModalProps} />}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
