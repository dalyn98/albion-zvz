import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { ExternalLink, Home, Sparkles } from 'lucide-react'
import SafeIntlProvider from '@/components/SafeIntlProvider'
import { ToastProvider } from '@/components/ToastProvider'
import DemoFeedbackProvider from './_components/DemoFeedbackProvider'
import DemoCaptureFrame from './_components/DemoCaptureFrame'
import DemoJourneyBanner from './_components/DemoJourneyBanner'
import DemoSessionProvider from './_components/DemoSessionProvider'
import DemoSidebar from './_components/DemoSidebar'
import { DEMO_GUILD_NAME } from '@/data/demo-seed'
import { getDemoClientMessages } from '@/lib/client-messages'

const OFFICIAL_HOME_HREF = 'https://albion-guildmanager.com/'

// `/demo` is a focused marketing preview, not a second copy of the whole app.
// Keep it dynamic because RootLayout depends on request pathname headers.
export const dynamic = 'force-dynamic'

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, t] = await Promise.all([
    getLocale(),
    getMessages(),
    getTranslations('demo'),
  ])

  return (
    <SafeIntlProvider
      locale={locale}
      messages={getDemoClientMessages(messages)}
    >
      <ToastProvider>
        <DemoSessionProvider>
          <DemoFeedbackProvider>
            <DemoCaptureFrame>
              <div
                className="v3-demo-status sticky top-0 z-50 min-h-10 border-b border-amber-400/25 bg-[#14120d]/95 px-3 text-xs font-semibold text-amber-100 backdrop-blur-xl sm:text-sm flex items-center justify-between gap-3"
                data-demo-capture-hide="true"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Sparkles size={13} className="shrink-0" />
                  <span className="truncate">{t('banner')}</span>
                </span>
                <div className="inline-flex shrink-0 items-center gap-1.5">
                  <div id="demo-tour-launcher" />
                  <a
                    href={OFFICIAL_HOME_HREF}
                    className="inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 text-[11px] font-bold text-amber-200 transition-colors hover:bg-amber-500/10 hover:text-amber-100 sm:text-xs"
                  >
                    <Home size={11} />
                    <span className="hidden sm:inline">{t('cta.officialSite')}</span>
                    <span className="sm:hidden">{t('cta.officialSiteShort')}</span>
                  </a>
                  <a
                    href="/login?returnTo=%2F"
                    className="inline-flex min-h-10 items-center gap-1 rounded bg-black/80 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-black sm:text-xs"
                  >
                    <ExternalLink size={11} />
                    <span className="hidden sm:inline">{t('cta.inviteBot')}</span>
                    <span className="sm:hidden">Discord</span>
                  </a>
                </div>
              </div>

              <div className="lg:flex">
                <div className="contents" data-demo-capture-hide="true">
                  <DemoSidebar brandName={DEMO_GUILD_NAME} />
                </div>
                <main
                  className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8"
                  data-demo-capture-main="true"
                >
                  <div
                    className="mx-auto w-full max-w-6xl"
                    data-demo-capture-content="true"
                  >
                    <div data-demo-capture-hide="true">
                      <DemoJourneyBanner />
                    </div>
                    {children}
                  </div>
                </main>
              </div>
            </DemoCaptureFrame>
          </DemoFeedbackProvider>
        </DemoSessionProvider>
      </ToastProvider>
    </SafeIntlProvider>
  )
}
