import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import { getMarketingTranslator } from '@/lib/marketing-static-intl'

export default async function InAppBrowserNoticeWithMessages() {
  const t = await getMarketingTranslator('inAppBrowserNotice')

  return (
    <InAppBrowserNotice
      title={t('title')}
      description={t('description')}
      copyButtonLabel={t('copyButton')}
      copiedLabel={t('copied')}
      copyFailedLabel={t('copyFailed')}
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
