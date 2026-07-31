import { getLocale, getMessages } from 'next-intl/server'
import SafeIntlProvider from '@/components/SafeIntlProvider'
import { getPublicTacticClientMessages } from '@/lib/client-messages'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  referrer: 'no-referrer',
}

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
