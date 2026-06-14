'use client'

import type { AbstractIntlMessages } from 'next-intl'
import { type Locale } from '@/i18n/locales'
import SafeIntlProvider from './SafeIntlProvider'

const MARKETING_INTL_NOW = new Date('2026-01-01T00:00:00.000Z')
const MARKETING_TIME_ZONE = 'Asia/Seoul'

interface Props {
  children: React.ReactNode
  locale: Locale
  messages: AbstractIntlMessages
}

export default function MarketingIntlProvider({ children, locale, messages }: Props) {
  return (
    <SafeIntlProvider
      formats={{}}
      locale={locale}
      messages={messages}
      now={MARKETING_INTL_NOW}
      timeZone={MARKETING_TIME_ZONE}
    >
      {children}
    </SafeIntlProvider>
  )
}
