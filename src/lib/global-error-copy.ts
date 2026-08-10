import type { Locale } from '@/i18n/locales'
import enMessages from '@/messages/en.json'
import arMessages from '@/messages/ar.json'
import deMessages from '@/messages/de.json'
import es419Messages from '@/messages/es-419.json'
import esEsMessages from '@/messages/es-ES.json'
import frMessages from '@/messages/fr.json'
import idMessages from '@/messages/id.json'
import itMessages from '@/messages/it.json'
import jaMessages from '@/messages/ja.json'
import koMessages from '@/messages/ko.json'
import plMessages from '@/messages/pl.json'
import ptBrMessages from '@/messages/pt-BR.json'
import ptPtMessages from '@/messages/pt-PT.json'
import ruMessages from '@/messages/ru.json'
import trMessages from '@/messages/tr.json'
import zhHantMessages from '@/messages/zh-Hant.json'
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
  'zh-Hant': zhHantMessages.globalError,
  fr: frMessages.globalError,
  de: deMessages.globalError,
  'es-ES': esEsMessages.globalError,
  'es-419': es419Messages.globalError,
  'pt-BR': ptBrMessages.globalError,
  'pt-PT': ptPtMessages.globalError,
  pl: plMessages.globalError,
  ru: ruMessages.globalError,
  it: itMessages.globalError,
  id: idMessages.globalError,
  ar: arMessages.globalError,
  tr: trMessages.globalError,
} satisfies Record<GlobalErrorLocale, GlobalErrorCopy>
