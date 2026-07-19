import type { ReactNode } from 'react'
import { getLocale, getMessages } from 'next-intl/server'
import SafeIntlProvider from '@/components/SafeIntlProvider'
import {
  APP_SHELL_ROOT_CLIENT_MESSAGE_NAMESPACES,
  pickClientMessages,
} from '@/lib/client-messages'

interface ScopedIntlProviderProps {
  children: ReactNode
  namespaces: readonly string[]
}

export default async function ScopedIntlProvider({
  children,
  namespaces,
}: ScopedIntlProviderProps) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])
  const scopedMessages = pickClientMessages(messages, [
    ...APP_SHELL_ROOT_CLIENT_MESSAGE_NAMESPACES,
    ...namespaces,
  ])

  return (
    <SafeIntlProvider locale={locale} messages={scopedMessages}>
      {children}
    </SafeIntlProvider>
  )
}
