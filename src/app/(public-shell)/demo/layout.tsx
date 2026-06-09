import { getTranslations } from 'next-intl/server'
import { ExternalLink, Home, Sparkles } from 'lucide-react'
import DemoFeedbackProvider from './_components/DemoFeedbackProvider'

// `/demo` is a focused marketing preview, not a second copy of the whole app.
// Keep it dynamic because RootLayout depends on request pathname headers.
export const dynamic = 'force-dynamic'

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('demo')

  return (
    <DemoFeedbackProvider>
      <div className="min-h-screen bg-[#0b0d12] text-white">
        <div className="sticky top-0 z-50 h-10 bg-amber-500 text-black text-xs sm:text-sm font-semibold px-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 truncate">
            <Sparkles size={13} className="shrink-0" />
            <span className="truncate">{t('banner')}</span>
          </span>
          <div className="inline-flex shrink-0 items-center gap-1.5">
            <a
              href="/public/landing"
              className="inline-flex items-center gap-1 bg-amber-100/80 hover:bg-amber-100 text-black text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded transition-colors"
            >
              <Home size={11} />
              <span className="hidden sm:inline">{t('cta.officialSite')}</span>
              <span className="sm:hidden">{t('cta.officialSiteShort')}</span>
            </a>
            <a
              href="/api/auth/discord/start?returnTo=/"
              className="inline-flex items-center gap-1 bg-black/80 hover:bg-black text-white text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded transition-colors"
            >
              <ExternalLink size={11} />
              <span className="hidden sm:inline">{t('cta.inviteBot')}</span>
              <span className="sm:hidden">Discord</span>
            </a>
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </DemoFeedbackProvider>
  )
}
