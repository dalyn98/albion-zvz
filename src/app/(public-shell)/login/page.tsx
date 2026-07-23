import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import LoginEntry from '@/components/LoginEntry'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { classifyHost } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
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
  referrer: 'no-referrer',
}

interface PageProps {
  searchParams: Promise<{
    returnTo?: string | string[]
    auth_error?: string | string[]
    retry?: string | string[]
  }>
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({ searchParams }: PageProps) {
  const [params, headersList, tEntry, tLanding, tAuthError, tInApp, tPublic] =
    await Promise.all([
      searchParams,
      headers(),
      getTranslations('loginEntry'),
      getTranslations('landing'),
      getTranslations('auth.error'),
      getTranslations('inAppBrowserNotice'),
      getTranslations('publicLanding'),
    ])
  const classification = classifyHost(headersList.get('host'))
  const derivedName =
    classification.kind === 'tenant' ? displayNameFromSlug(classification.slug) : ''
  const siteName = derivedName || tPublic('siteName')
  const returnTo = sanitizeInternalReturnTo(first(params.returnTo))
  const authError = first(params.auth_error)?.trim() || null

  return (
    <LoginEntry
      siteName={siteName}
      returnTo={returnTo}
      authError={authError}
      forceConsent={first(params.retry) === '1'}
      title={tEntry('title')}
      description={tEntry('description')}
      continueLabel={tEntry('continueButton')}
      retryLabel={tLanding('retry')}
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
        appLoginInvalid: tAuthError('appLoginInvalid'),
        default: tAuthError('default'),
      }}
      inAppBrowserNotice={{
        title: tInApp('title'),
        description: tInApp('description'),
        copyButtonLabel: tInApp('copyButton'),
        copiedLabel: tInApp('copied'),
        copyFailedLabel: tInApp('copyFailed'),
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
