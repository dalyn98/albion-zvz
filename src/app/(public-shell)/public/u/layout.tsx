import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getPublicActivityClientMessages } from '@/lib/client-messages'

export default async function PublicActivityLayout({
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
      messages={getPublicActivityClientMessages(messages)}
    >
      {children}
    </NextIntlClientProvider>
  )
}
