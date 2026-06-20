import type { Metadata, Viewport } from 'next'
import './globals.css'
import { pretendard } from './font'
import { getLocale } from '@/lib/locale'

export const metadata: Metadata = {
  metadataBase: new URL('https://albion-guildmanager.com'),
  title: 'Albion Guild Manager',
  description: 'Albion Online ZvZ guild operations platform.',
  applicationName: 'Albion Guild Manager',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d12',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`h-full antialiased ${pretendard.variable}`}>
      <body className="min-h-full text-foreground">{children}</body>
    </html>
  )
}
