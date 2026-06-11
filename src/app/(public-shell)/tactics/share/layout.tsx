import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getPublicTacticClientMessages } from '@/lib/client-messages'

export default async function PublicTacticShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [locale, messages] = await Promise.all([
    getLocale(),
    getMessages(),
  ])

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={getPublicTacticClientMessages(messages)}
    >
      {children}
    </NextIntlClientProvider>
  )
}
