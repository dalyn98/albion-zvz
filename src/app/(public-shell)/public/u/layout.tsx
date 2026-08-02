import type { Metadata } from 'next'
import { getLocale, getMessages } from 'next-intl/server'
import SafeIntlProvider from '@/components/SafeIntlProvider'
import { getPublicActivityClientMessages } from '@/lib/client-messages'

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
