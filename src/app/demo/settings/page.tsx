import { getTranslations } from 'next-intl/server'
import { Sparkles } from 'lucide-react'
import DemoSettingsTabs from '../_components/DemoSettingsTabs'
import DemoCTACard from '../_components/DemoCTACard'

// `/demo/settings` — `/admin/dashboard/settings` 의 정적 비주얼 클론.
// 5개 탭 (guild/permissions/events/regear/landing) 구조 그대로, 각 form 은
// 대표 항목만 disabled 상태로 노출. 실제 SettingsTabs 의 클라이언트 컴포넌트
// 들을 그대로 가져오면 server action 이 생성돼 데모에선 부적절 — 시각적으로
// 동등한 더미만 렌더한다.
export default async function DemoSettingsPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('adminSettings'),
    getTranslations('demo.settings'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('demoNotice')}</p>
      </div>

      <DemoSettingsTabs />

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('settings.title')}
        description={tCta('settings.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
