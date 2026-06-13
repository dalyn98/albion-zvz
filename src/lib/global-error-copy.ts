import type { Locale } from '@/i18n/locales'
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import koMessages from '@/messages/ko.json'
import zhMessages from '@/messages/zh.json'

export type GlobalErrorLocale = Locale

export interface GlobalErrorCopy {
  title: string
  description: string
  retry: string
}

export const GLOBAL_ERROR_COPY = {
  ko: koMessages.globalError,
  ja: jaMessages.globalError,
  en: enMessages.globalError,
  zh: zhMessages.globalError,
} satisfies Record<GlobalErrorLocale, GlobalErrorCopy>
