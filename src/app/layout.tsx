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
import SystemNoticesBanner from '@/components/SystemNoticesBanner'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { ToastProvider } from '@/components/ToastProvider'
import { ConfirmDialogProvider } from '@/components/ConfirmDialog'
import { UnsavedChangesProvider } from '@/components/UnsavedChangesProvider'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import { getMemberAlbionIdentity } from '@/lib/albion-identity'
import { getSessionGuildId, getPrimaryTenantId, getTenantDiscordConfig } from '@/lib/tenant'
import { isSuperAdminSession } from '@/lib/super-admin'
import { classifyHost, getCanonicalRootDomain, resolveTenantBySlug } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'

// Routes that should render for anyone, even without a session. The proxy
// forwards the pathname via x-pathname so we can decide here without duplicating
// the matcher logic.
function isPublicPathname(pathname: string): boolean {
  if (pathname.startsWith('/public/')) return true
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return true
  return false
}

// 마케팅 페이지(/public/(marketing)/*) 는 자체 헤더(MarketingNav) + 푸터를
// 갖고 있어 PublicShell/AppShell 의 sticky 헤더를 한 번 더 깔면 시각적 충돌이
// 생긴다(두 줄짜리 헤더, 언어 스위처/CTA 중복). children 만 그대로 렌더해
// 마케팅 페이지 내부 컴포넌트가 풀 컨트롤을 갖게 한다. proxy 에서 canonical
// /, /features, /pricing, /faq, /privacy, /terms 가 이 경로들로 rewrite 된다.
function isMarketingPathname(pathname: string): boolean {
  return (
    pathname === '/public/landing' ||
    pathname === '/public/features' ||
    pathname === '/public/pricing' ||
    pathname === '/public/faq' ||
    pathname === '/public/privacy' ||
    pathname === '/public/terms' ||
    pathname === '/public/docs' ||
    pathname.startsWith('/public/docs/') ||
    pathname === '/public/g' ||
    pathname.startsWith('/public/g/') ||
    pathname === '/public/u' ||
    pathname.startsWith('/public/u/')
  )
}

// Tenant 온보딩 경로: 로그인은 됐지만 아직 어떤 tenant 에도 속하지 않은
// 사용자가 봇을 설치하고 초기 설정을 하는 흐름. role 이 없으므로 layout 의
// gate 를 우회하고, 자체 페이지에서 session.discordId 로 검증한다.
function isOnboardPathname(pathname: string): boolean {
  return pathname === '/onboard' || pathname.startsWith('/onboard/')
}

// `/public/g/<slug>` 는 길드 공개 프로필이라 기본은 marketing 처리(자체
// MarketingNav, 사이드바 없음). 하지만 그 길드의 멤버 본인이 보고 있다면
// "내 길드 홈" 이 되므로 AppShell 의 사이드바를 둘러줘야 길드 내 다른 페이지
// 와 일관성이 유지된다. slug 를 추출해 tenant 를 해석한 뒤 세션과 매칭.
function extractGuildSlugFromPathname(pathname: string): string | null {
  if (!pathname.startsWith('/public/g/')) return null
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 3 || segments[0] !== 'public' || segments[1] !== 'g') {
    return null
  }
  const slug = segments[2]
  return slug.length > 0 ? slug : null
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
//
// /onboard (테넌트 기본 설정 위저드) 도 skip — 봇을 갓 설치한 사용자에겐 먼저
// 길드/채널/리워드 등 기본 설정을 끝내게 하고, 그 뒤 자연스러운 흐름으로
// {slug}.albion-guildmanager.com/admin/dashboard 에 도착했을 때 알비온 인증
// 모달이 뜨도록 한다. 위저드 위에 모달이 덮이면 위저드를 못 보고 막혀버림.
function skipAlbionOnboardingModal(pathname: string): boolean {
  if (pathname.startsWith('/onboarding/albion')) return true
  // '/onboard' (admin install) 와 '/onboard/setup/...' 만 매칭. 그냥
  // startsWith('/onboard') 는 '/onboarding/...' 까지 잡아버려 미래에 새 멤버용
  // /onboarding/* 라우트가 추가되면 의도치 않게 모달이 죽음. 현재는 line 72 가
  // /onboarding/albion 을 먼저 처리해서 안전하지만 패턴 자체를 견고하게 둔다.
  if (pathname === '/onboard' || pathname.startsWith('/onboard/')) return true
  if (pathname.startsWith('/welcome-language')) return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/public/')) return true
  if (pathname.startsWith('/super-admin')) return true
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return true
  if (pathname === '/logout') return true
  return false
}

// canonical 루트 도메인의 마케팅 surface 만 검색 인덱싱·OG 임베드 허용.
// /g/<slug> 는 별도 페이지 generateMetadata 가 openGraph 까지 덮어쓰므로
// 여기서는 robots 만 풀어 주면 충분하다.
function isIndexablePathname(pathname: string): boolean {
  if (pathname === '/' || pathname === '/landing') return true
  if (
    pathname === '/pricing' ||
    pathname === '/faq' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/')
  ) return true
  if (pathname === '/g' || pathname.startsWith('/g/')) return true
  // 캐노니컬 호스트에서 proxy rewrite 가 안 걸린 직접 path 도 동일하게 허용.
  if (
    pathname === '/public/landing' ||
    pathname === '/public/pricing' ||
    pathname === '/public/faq' ||
    pathname === '/public/privacy' ||
    pathname === '/public/terms'
  ) return true
  if (pathname === '/public/docs' || pathname.startsWith('/public/docs/')) return true
  if (pathname === '/public/g' || pathname.startsWith('/public/g/')) return true
  return false
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, headersList] = await Promise.all([
    getTranslations('meta'),
    headers(),
  ])
  // 브라우저 탭 제목은 길드별로 다르게 — host 가 tenant 서브도메인일 때 slug
  // 첫 하이픈 앞부분을 그대로 title 로 사용 (사이드바/배너의 brandName 과 동일).
  // canonical/preview/localhost 는 i18n 의 기본 title 유지.
  const classification = classifyHost(headersList.get('host'))
  const pathname = headersList.get('x-pathname') ?? ''

  // 테넌트 서브도메인 ({slug}.albion-guildmanager.com) 는 OG/Twitter 카드를
  // 길드별로 덮어쓴다 — Discord/Slack 임베드 미리보기에 사이트 공통 카드 대신
  // 그 길드의 banner/식별자가 노출되도록. 이미지는 관리자가 /admin/dashboard/settings
  // 에서 올린 landing_banner_url(공개 storage URL) 을 그대로 재활용한다.
  // 미설정 길드는 default OG 이미지로 폴백.
  let tenantOverride: {
    siteName: string
    bannerUrl: string
    canonicalUrl: string
    title: string
    description: string
  } | null = null
  if (classification.kind === 'tenant') {
    const tenant = await resolveTenantBySlug(classification.slug)
    if (tenant) {
      const bannerUrl = (
        await getAppSetting('landing_banner_url', '', tenant.tenantId)
      ).trim()
      const siteName = displayNameFromSlug(tenant.slug) || t('ogSiteName')
      tenantOverride = {
        siteName,
        bannerUrl,
        canonicalUrl: `https://${tenant.slug}.${getCanonicalRootDomain()}`,
        title: t('ogGuildTitle', { name: siteName }),
        description: t('ogGuildDescription', { name: siteName }),
      }
    }
  }

  const tabTitle = tenantOverride?.siteName ?? t('title')

  // 인덱싱 정책:
  //  - canonical root host (`albion-guildmanager.com`) 의 마케팅/공개 path → index, follow
  //  - 그 외 (테넌트 서브도메인, 프리뷰, 로컬, 앱 path) → noindex, nofollow
  //
  // 테넌트 서브도메인의 동일 path 는 noindex 로 두어 중복 인덱싱을 막고,
  // 검색 결과는 항상 root 도메인의 canonical URL 로 모은다.
  const indexable =
    classification.kind === 'root' && isIndexablePathname(pathname)
  const robots = indexable
    ? { index: true, follow: true }
    : {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
      }

  const ogTitle = tenantOverride?.title ?? t('ogDefaultTitle')
  const ogDescription = tenantOverride?.description ?? t('ogDefaultDescription')
  const ogSiteName = tenantOverride?.siteName ?? t('ogSiteName')
  const ogUrl = tenantOverride?.canonicalUrl ?? 'https://albion-guildmanager.com'
  const ogImages = tenantOverride?.bannerUrl ? [tenantOverride.bannerUrl] : undefined

  // metadataBase: 테넌트 서브도메인은 자기 호스트로 — Next.js 의
  // opengraph-image.tsx 파일 컨벤션이 자동 생성하는 og:image URL 도 동일 호스트로
  // 만들어 그쪽 라우트 핸들러가 host 단위로 길드 banner 를 stream 할 수 있게.
  // canonical/preview 는 기존 albion-guildmanager.com 유지.
  const metadataBase = tenantOverride
    ? new URL(tenantOverride.canonicalUrl)
    : new URL('https://albion-guildmanager.com')

  // OG/Twitter 카드 — Discord/Slack/Twitter 임베드 시 노출. 페이지 단위
  // generateMetadata (예: /g/<slug>) 가 같은 키를 다시 export 하면 자동
  // 오버라이드된다. 여기서는 사이트 전체 기본값 + 테넌트 서브도메인 override.
  return {
    metadataBase,
    title: tabTitle,
    description: t('description'),
    keywords: [
      'AlbionGuildManager',
      'Albion Guild Manager',
      'Albion Online guild',
      'Albion ZvZ',
      'Albion killboard',
      'Albion regear',
      'Albion guild bot',
      'Discord guild bot',
    ],
    applicationName: ogSiteName,
    robots,
    openGraph: {
      type: 'website',
      siteName: ogSiteName,
      title: ogTitle,
      description: ogDescription,
      url: ogUrl,
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      ...(ogImages ? { images: ogImages } : {}),
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: tabTitle,
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // canvas (--color-background hsl 222 22% 6%) 와 동기. 모바일 상태바 색이
  // 페이지 bg 와 매끄럽게 이어지도록.
  themeColor: '#0b0d12',
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
  const isMarketingRaw = isMarketingPathname(pathname)
  const isOnboard = isOnboardPathname(pathname)

  // `/public/g/<slug>` 페이지에서, 그 길드의 멤버 본인이 접속한 경우에만 marketing
  // 처리를 끄고 AppShell(사이드바) 을 둘러준다. 다른 길드 멤버나 비로그인 방문자는
  // 기존 marketing 페이지(자체 MarketingNav) 그대로 — 사이드바는 자기 길드 컨텍스트
  // 일 때만 의미가 있다.
  let viewingOwnGuildProfile = false
  if (
    isMarketingRaw &&
    session &&
    (session.isMember || session.isAdmin) &&
    session.guildId
  ) {
    const slug = extractGuildSlugFromPathname(pathname)
    if (slug) {
      const tenant = await resolveTenantBySlug(slug)
      if (tenant && tenant.tenantId === session.guildId) {
        viewingOwnGuildProfile = true
      }
    }
  }
  const isMarketing = isMarketingRaw && !viewingOwnGuildProfile

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
  //
  // 슈퍼어드민 예외: 슈퍼어드민(개발자/운영자) 은 다른 테넌트를 점검할 때
  // 해당 테넌트의 guild_avatars 행이 없을 수 있고, 본질적으로 그 테넌트의
  // 멤버가 아니므로 알비온 인증을 강제할 이유가 없음 → 모달과 강제 리다이렉트
  // 전부 skip.
  let onboardingModalProps: {
    discordNickname: string
    initialIdentity: Awaited<ReturnType<typeof getMemberAlbionIdentity>>
    homeGuildConfigured: boolean
  } | null = null
  if (
    !isPublic &&
    session?.isMember &&
    !isSuperAdminSession(session) &&
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
    // tenant, 없으면 host 의 subdomain 으로 tenant 를 해석. 둘 다 실패하면
    // primary tenant fallback. siteName 은 sidebar/모바일 헤더와 동일하게 slug
    // 첫 하이픈 앞부분에서 파생 — Discord 길드명(tenant.name) 대신 사용자가
    // wizard 에서 정한 식별자가 그대로 보이도록.
    const hostHeader = headersList.get('host')
    const classification = classifyHost(hostHeader)
    let resolvedTenantSlug: string | null = null
    let gateGuildId: string
    if (session) {
      gateGuildId = await getSessionGuildId(session)
      const cfg = await getTenantDiscordConfig(gateGuildId)
      resolvedTenantSlug = cfg?.slug ?? null
    } else if (classification.kind === 'tenant') {
      const resolved = await resolveTenantBySlug(classification.slug)
      if (resolved) {
        gateGuildId = resolved.tenantId
        resolvedTenantSlug = resolved.slug
      } else {
        gateGuildId = await getPrimaryTenantId()
      }
    } else {
      gateGuildId = await getPrimaryTenantId()
    }
    const [bannerUrl, ctaText, tLanding, tAuthError, tPublicLanding, tInApp] = await Promise.all([
      getAppSetting('landing_banner_url', '', gateGuildId),
      getAppSetting('landing_cta_text', '', gateGuildId),
      getTranslations('landing'),
      getTranslations('auth.error'),
      getTranslations('publicLanding'),
      getTranslations('inAppBrowserNotice'),
    ])
    const derivedBrandName = resolvedTenantSlug ? displayNameFromSlug(resolvedTenantSlug) : ''
    const siteName = derivedBrandName.length > 0 ? derivedBrandName : tPublicLanding('siteName')
    // 테넌트 서브도메인에서 "더 알아보기" 를 누르면 공식 사이트는 항상
    // canonical 루트로 연다. `/public/landing` 를 그대로 쓰면 공유 URL 이 길드
    // 컨텍스트를 띠게 된다.
    const learnMoreHref =
      classification.kind === 'tenant'
        ? `https://${getCanonicalRootDomain()}/`
        : '/public/landing'
    gateContent = (
      <AppGate
        reason={session ? 'no_role' : 'not_logged_in'}
        siteName={siteName}
        bannerUrl={bannerUrl}
        ctaText={ctaText || tLanding('defaultCta')}
        loginLabel={tLanding('discordLogin')}
        memberRequiredLabel={tLanding('memberRequired')}
        invitePromptLabel={tLanding('invitePrompt')}
        logoutLabel={tLanding('logout')}
        learnMoreLabel={tLanding('learnMore')}
        learnMoreHref={learnMoreHref}
        authErrorLabels={{
          denied: tAuthError('denied'),
          invalid: tAuthError('invalid'),
          stateMismatch: tAuthError('stateMismatch'),
          notInGuild: tAuthError('notInGuild'),
          noIdentity: tAuthError('noIdentity'),
          noRole: tAuthError('noRole'),
          serverError: tAuthError('serverError'),
          hopMissing: tAuthError('hopMissing'),
          hopInvalid: tAuthError('hopInvalid'),
          hopWrongHost: tAuthError('hopWrongHost'),
          hopNoTenant: tAuthError('hopNoTenant'),
          default: tAuthError('default'),
        }}
        retryLabel={tLanding('retry')}
        inAppBrowserNotice={{
          title: tInApp('title'),
          description: tInApp('description'),
          copyButtonLabel: tInApp('copyButton'),
          copiedLabel: tInApp('copied'),
          openBrowserLabel: tInApp('openBrowser'),
          perAppHint: {
            kakaotalk: tInApp('hintKakaoTalk'),
            discord: tInApp('hintDiscord'),
            instagram: tInApp('hintInstagram'),
            facebook: tInApp('hintFacebook'),
            line: tInApp('hintLine'),
            naver: tInApp('hintNaver'),
            wechat: tInApp('hintWechat'),
            unknown_webview: tInApp('hintUnknown'),
          },
        }}
      />
    )
  }

  // /demo 는 마케팅용 데모 페이지라 로그인 CTA 가 들어간 PublicShell 을
  // 두르지 않는다 — 페이지 내부에 자체 hero/footer 구성이 있고, 헤더에 로그인
  // 버튼이 보이면 "로그인이 필요한 페이지" 로 오해될 수 있음. AppShell 도 마찬가지로
  // 사이드바가 데모 흐름을 깬다.
  const isDemo = pathname === '/demo' || pathname.startsWith('/demo/')

  // Public routes: if the visitor has a real session, give them the normal
  // AppShell so the sidebar stays consistent; otherwise wrap in a minimal
  // PublicShell with a login CTA. 온보딩은 아직 어떤 길드에도 속하지 않은
  // 사용자라 AppSidebar 가 어색해서 PublicShell 로 통일.
  // 마케팅 페이지는 자체 헤더/푸터를 갖고 있어 children 만 렌더 — isDemo 와
  // 동일한 처리. AppShell 사이드바나 PublicShell 의 sticky 헤더가 들어가면
  // 디자인이 무너진다.
  const body = locked
    ? gateContent
    : isDemo || isMarketing
      ? children
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
      <body className="min-h-full text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <ConfirmDialogProvider>
              <UnsavedChangesProvider>
                <ImpersonationBanner />
                <SystemNoticesBanner />
                {body}
                {onboardingModalProps && <AlbionOnboardingModal {...onboardingModalProps} />}
              </UnsavedChangesProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
