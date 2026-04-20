import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import AppShell from '@/components/AppShell'
import AppGate from '@/components/AppGate'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('title'),
    description: t('description'),
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
  const [locale, messages, session] = await Promise.all([
    getLocale(),
    getMessages(),
    getSession(),
  ])

  // Verify guests still exist in the DB so admin deletions take effect on the
  // next request rather than waiting for the 7-day cookie to expire.
  let guestRevoked = false
  if (session && !session.isMember && session.isGuest) {
    const { data } = await getAdminClient()
      .from('guests')
      .select('discord_id')
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (!data) guestRevoked = true
  }

  const locked = !session || (!session.isMember && !session.isGuest) || guestRevoked

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

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full bg-[#0f1117] text-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {locked ? gateContent : <AppShell>{children}</AppShell>}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
