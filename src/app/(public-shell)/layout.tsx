import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getClientMessagesForPathname } from '@/lib/client-messages'

export default async function PublicShellRouteGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [locale, messages, headersList] = await Promise.all([
    getLocale(),
    getMessages(),
    headers(),
  ])
  const pathname = headersList.get('x-pathname') ?? ''

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={getClientMessagesForPathname(messages, pathname)}
    >
      {children}
    </NextIntlClientProvider>
  )
}
