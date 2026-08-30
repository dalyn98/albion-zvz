import type { Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { pretendard } from './font'
import { getLocale } from '@/lib/locale'
import { buildCanonicalRootMetadata } from '@/lib/seo-metadata'
import { getIntlLocale, getLocaleDirection } from '@/i18n/locales'

export const metadata = buildCanonicalRootMetadata(
  process.env.GOOGLE_SITE_VERIFICATION,
)

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d12',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html
      lang={getIntlLocale(locale)}
      dir={getLocaleDirection(locale)}
      className={`h-full antialiased ${pretendard.variable}`}
    >
      <body className="min-h-full text-foreground">
        {children}
        {process.env.VERCEL === '1' ? <SpeedInsights /> : null}
      </body>
    </html>
  )
}
