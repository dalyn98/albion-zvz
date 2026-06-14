import { getLocale, getMessages } from 'next-intl/server'
import SafeIntlProvider from '@/components/SafeIntlProvider'
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
    <SafeIntlProvider
      locale={locale}
      messages={getPublicActivityClientMessages(messages)}
    >
      {children}
    </SafeIntlProvider>
  )
}
