import { getLocale, getMessages } from 'next-intl/server'
import SafeIntlProvider from '@/components/SafeIntlProvider'
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
    <SafeIntlProvider
      locale={locale}
      messages={getPublicTacticClientMessages(messages)}
    >
      {children}
    </SafeIntlProvider>
  )
}
