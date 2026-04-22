import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import AppShell from '@/components/AppShell'
import AppGate from '@/components/AppGate'
import PublicShell from '@/components/PublicShell'
import { ToastProvider } from '@/components/ToastProvider'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'

// Routes that should render for anyone, even without a session. The proxy
// forwards the pathname via x-pathname so we can decide here without duplicating
// the matcher logic.
function isPublicPathname(pathname: string): boolean {
  return pathname.startsWith('/public/')
}

// 이벤트 스코프 게스트가 접근 가능한 경로. 자기 이벤트 + welcome 외엔 모두
// 본인 이벤트로 리다이렉트된다. (API 라우트는 이 layout 으로 wrap 되지 않아
// 별도 제어 불필요.)
function isAllowedForEventScope(pathname: string, eventScope: string): boolean {
  if (pathname === `/events/${eventScope}`) return true
  if (pathname.startsWith(`/events/${eventScope}/`)) return true
  if (pathname.startsWith('/welcome-language')) return true
  if (pathname.startsWith('/public/')) return true
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

  // Verify guests still exist in the DB so admin deletions take effect on the
  // next request rather than waiting for the 7-day cookie to expire. Public
  // routes skip this — anyone can see them regardless of session state.
  let guestRevoked = false
  if (!isPublic && session && !session.isMember && session.isGuest) {
    const { data } = await getAdminClient()
      .from('guests')
      .select('discord_id')
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

  const locked =
    !isPublic && (!session || (!session.isMember && !session.isGuest) || guestRevoked)

  let gateContent: React.ReactNode = null
  if (locked) {
    const [bannerUrl, ctaText, tLanding, tAuthError] = await Promise.all([
      getAppSetting('landing_banner_url', ''),
      getAppSetting('landing_cta_text', ''),
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
  // PublicShell with a login CTA.
  const body = locked
    ? gateContent
    : isPublic && !session
      ? <PublicShell>{children}</PublicShell>
      : <AppShell>{children}</AppShell>

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full bg-[#0f1117] text-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>{body}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
