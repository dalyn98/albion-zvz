import { getTranslations } from 'next-intl/server'
import { Sparkles, ExternalLink } from 'lucide-react'
import { DemoSidebar, DemoSidebarMobile } from './_components/DemoSidebar'

// `/demo/*` 공개 라우트의 shell.
// - 좌측: DemoSidebar (실제 앱 사이드바 모방, 활성 4 / 비활성 5).
// - 상단: sticky banner "DEMO 미리보기" + Discord 봇 초대 CTA.
// - 모바일: DemoSidebarMobile (chip 가로 스크롤).
//
// 주의: `force-static` 금지. 이 라우트는 layout.tsx 의 isPublicPathname 분기로
// AppGate/PublicShell 을 우회하므로 동적 렌더링 필수.
export const dynamic = 'force-dynamic'

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('demo')

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex flex-col">
      <div className="sticky top-0 z-50 h-9 bg-amber-500 text-black text-xs sm:text-sm font-semibold px-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 truncate">
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">{t('banner')}</span>
        </span>
        <a
          href="/api/auth/discord/start?returnTo=/"
          className="inline-flex shrink-0 items-center gap-1 bg-black/80 hover:bg-black text-white text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded transition-colors"
        >
          <ExternalLink size={11} />
          <span className="hidden sm:inline">{t('cta.inviteBot')}</span>
          <span className="sm:hidden">Discord</span>
        </a>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <DemoSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <DemoSidebarMobile />
          <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-6xl w-full">{children}</main>
        </div>
      </div>
    </div>
  )
}
