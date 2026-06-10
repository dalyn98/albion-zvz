import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getClientMessages } from '@/lib/client-messages'

export default async function PublicShellRouteGroupLayout({
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
      messages={getClientMessages(messages)}
    >
      {children}
    </NextIntlClientProvider>
  )
}
