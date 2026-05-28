import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import DiscordInstallBridge from '@/components/DiscordInstallBridge'
import { buildBotInstallUrl } from '@/lib/discord'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ guild_id?: string }>
}

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

export default async function OnboardBotInstallOpenPage({ searchParams }: PageProps) {
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/onboard')

  const params = await searchParams
  const guildId = params.guild_id
  if (!guildId || !/^\d{17,20}$/.test(guildId)) redirect('/onboard')

  const [t, tInApp] = await Promise.all([
    getTranslations('discordInstallBridge'),
    getTranslations('inAppBrowserNotice'),
  ])
  const installUrl = buildBotInstallUrl({ guildId, state: crypto.randomUUID() })

  return (
    <DiscordInstallBridge
      title={t('title')}
      description={t('description')}
      continueLabel={t('continueButton')}
      hint={t('hint')}
      installUrl={installUrl}
      backHref="/onboard"
      backLabel={t('backToOnboard')}
      inAppBrowserNotice={inAppNoticeProps(tInApp)}
    />
  )
}
