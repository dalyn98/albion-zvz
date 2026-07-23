import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import DiscordInstallBridge from '@/components/DiscordInstallBridge'

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

function inAppNoticeProps(tInApp: Awaited<ReturnType<typeof getTranslations>>) {
  return {
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
  }
}

export default async function InviteOpenPage({
  searchParams,
}: {
  searchParams: Promise<{ install_error?: string | string[] }>
}) {
  const [params, t, tInApp] = await Promise.all([
    searchParams,
    getTranslations('discordInstallBridge'),
    getTranslations('inAppBrowserNotice'),
  ])
  const installUrl = '/invite?continue=1'
  const rawError = Array.isArray(params.install_error)
    ? params.install_error[0]
    : params.install_error
  const errorMessage = rawError
    ? rawError === 'denied'
      ? t('installErrorDenied')
      : t('installErrorInvalid')
    : null

  return (
    <DiscordInstallBridge
      title={t('title')}
      description={t('description')}
      continueLabel={t('continueButton')}
      hint={t('hint')}
      installUrl={installUrl}
      errorMessage={errorMessage}
      inAppBrowserNotice={inAppNoticeProps(tInApp)}
    />
  )
}
