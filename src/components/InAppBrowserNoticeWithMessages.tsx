import { getTranslations } from 'next-intl/server'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'

export default async function InAppBrowserNoticeWithMessages() {
  const t = await getTranslations('inAppBrowserNotice')

  return (
    <InAppBrowserNotice
      title={t('title')}
      description={t('description')}
      copyButtonLabel={t('copyButton')}
      copiedLabel={t('copied')}
      openBrowserLabel={t('openBrowser')}
      perAppHint={{
        kakaotalk: t('hintKakaoTalk'),
        discord: t('hintDiscord'),
        instagram: t('hintInstagram'),
        facebook: t('hintFacebook'),
        line: t('hintLine'),
        naver: t('hintNaver'),
        wechat: t('hintWechat'),
        unknown_webview: t('hintUnknown'),
      }}
    />
  )
}
