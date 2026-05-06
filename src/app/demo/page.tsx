import { getTranslations } from 'next-intl/server'
import { ExternalLink } from 'lucide-react'
import { DEMO_EVENTS } from '@/data/demo-seed'
import DemoHomeEventList from './_components/DemoHomeEventList'

// `/demo` 는 실제 `/` 와 동일한 비주얼: 카테고리별 이벤트 카드 그리드.
// "ended" 이벤트는 `/demo/events` (아카이브 자리) 로 분리, 홈은 active 만.
export default async function DemoHomePage() {
  const [t, tHome] = await Promise.all([
    getTranslations('demo'),
    getTranslations('home'),
  ])

  const activeEvents = DEMO_EVENTS.filter((e) => e.status !== 'ended')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {tHome('title')}
          </h1>
          <p className="text-gray-400 text-sm">{tHome('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
          >
            <ExternalLink size={14} />
            <span className="truncate">{t('cta.inviteBot')}</span>
          </a>
        </div>
      </div>

      {activeEvents.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">{tHome('empty')}</p>
        </div>
      ) : (
        <DemoHomeEventList events={activeEvents} />
      )}

      <p className="text-[11px] text-gray-600 italic px-1">{t('events.demoOnlyDetail')}</p>
    </div>
  )
}
