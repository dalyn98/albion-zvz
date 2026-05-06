import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Sparkles, ArrowLeft, ExternalLink } from 'lucide-react'

// `/demo/*` 미생성 라우트 진입 시 노출되는 친근한 안내 화면.
// 표준 404 ("주소를 찾을 수 없음") 대신 "데모에서는 이 페이지를 미리볼 수 없어요"
// 라는 톤으로, demo layout shell 안에서 렌더된다 (DemoSidebar/배너 그대로 노출).
export default async function DemoNotFound() {
  const t = await getTranslations('demo.notFound')

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg space-y-5 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent p-6 sm:p-8 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <Sparkles size={22} />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-sm text-gray-400 leading-relaxed">{t('body')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-center pt-1">
          <Link
            href="/demo"
            className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ArrowLeft size={14} />
            {t('cta')}
          </Link>
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="inline-flex items-center justify-center gap-1.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ExternalLink size={14} />
            {t('exploreCta')}
          </a>
        </div>
      </div>
    </div>
  )
}
