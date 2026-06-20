import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { cache, type ReactNode } from 'react'
import type { Locale } from '@/i18n/locales'
import { getLocale } from '@/lib/locale'

type MarketingRichValue = (chunks: ReactNode) => ReactNode

interface MarketingTranslator {
  (key: string, values?: Record<string, string | number | Date>): string
  rich(key: string, values: Record<string, MarketingRichValue>): ReactNode
}

const MESSAGE_LOADERS: Record<Locale, () => Promise<AbstractIntlMessages>> = {
  ko: () => import('@/messages/ko.json').then((module) => module.default as AbstractIntlMessages),
  ja: () => import('@/messages/ja.json').then((module) => module.default as AbstractIntlMessages),
  en: () => import('@/messages/en.json').then((module) => module.default as AbstractIntlMessages),
  zh: () => import('@/messages/zh.json').then((module) => module.default as AbstractIntlMessages),
}

export const getMarketingLocale = cache(async (): Promise<Locale> => getLocale())

export const getMarketingMessages = cache(async (locale?: Locale): Promise<AbstractIntlMessages> => {
  const resolvedLocale = locale ?? await getMarketingLocale()
  return MESSAGE_LOADERS[resolvedLocale]()
})

export async function getMarketingTranslator(
  namespace: string,
  locale?: Locale,
): Promise<MarketingTranslator> {
  const resolvedLocale = locale ?? await getMarketingLocale()
  const messages = await getMarketingMessages(resolvedLocale)
  const t = createTranslator({
    locale: resolvedLocale,
    messages,
    namespace: namespace as never,
  })

  const translate = ((key, values) => (
    t(key as never, values as never)
  )) as MarketingTranslator
  translate.rich = (key, values) => t.rich(key as never, values as never)
  return translate
}
