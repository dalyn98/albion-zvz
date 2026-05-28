import { getTranslations } from 'next-intl/server'
import DiscordInstallBridge from '@/components/DiscordInstallBridge'
import { buildOpenBotInstallUrl } from '@/lib/discord'

export const dynamic = 'force-dynamic'

function inAppNoticeProps(tInApp: Awaited<ReturnType<typeof getTranslations>>) {
  return {
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
  }
}

export default async function InviteOpenPage() {
  const [t, tInApp] = await Promise.all([
    getTranslations('discordInstallBridge'),
    getTranslations('inAppBrowserNotice'),
  ])
  const installUrl = buildOpenBotInstallUrl({ state: crypto.randomUUID() })

  return (
    <DiscordInstallBridge
      title={t('title')}
      description={t('description')}
      continueLabel={t('continueButton')}
      hint={t('hint')}
      installUrl={installUrl}
      inAppBrowserNotice={inAppNoticeProps(tInApp)}
    />
  )
}
