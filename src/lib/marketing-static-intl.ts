import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import type { ReactNode } from 'react'
import koMessages from '@/messages/ko.json'
import { DEFAULT_LOCALE } from '@/i18n/locales'

type MarketingRichValue = (chunks: ReactNode) => ReactNode

interface MarketingTranslator {
  (key: string, values?: Record<string, string | number | Date>): string
  rich(key: string, values: Record<string, MarketingRichValue>): ReactNode
}

const MARKETING_MESSAGES = koMessages as AbstractIntlMessages

export function getMarketingMessages(): AbstractIntlMessages {
  return MARKETING_MESSAGES
}

export function getMarketingTranslator(namespace: string): MarketingTranslator {
  const t = createTranslator({
    locale: DEFAULT_LOCALE,
    messages: MARKETING_MESSAGES,
    namespace: namespace as never,
  })

  const translate = ((key, values) => (
    t(key as never, values as never)
  )) as MarketingTranslator
  translate.rich = (key, values) => t.rich(key as never, values as never)
  return translate
}
