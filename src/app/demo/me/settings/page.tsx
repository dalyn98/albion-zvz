import { getTranslations } from 'next-intl/server'
import { Bell, Clock, Languages, Sparkles } from 'lucide-react'
import DemoActionButton from '../../_components/DemoActionButton'
import DemoCTACard from '../../_components/DemoCTACard'

// 실 /me/settings 의 비주얼 클론 — 언어 선택 + DM 토글 + 카테고리 DM 설정 +
// 시간대. server actions 가 필요 없도록 disabled 비주얼만 보여주고, 클릭 시
// DemoActionButton 토스트로 "데모용 작업이라 저장되지 않아요" 안내.

const LANGUAGE_OPTIONS = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
] as const

const ACTIVE_LANGUAGE = 'ko'

const DM_CATEGORIES = [
  { key: 'event', labelKey: 'settingsDmCategoryEvent' as const, enabled: true },
  { key: 'regear', labelKey: 'settingsDmCategoryRegear' as const, enabled: true },
  { key: 'exchange', labelKey: 'settingsDmCategoryExchange' as const, enabled: false },
] as const

export default async function DemoMySettingsPage() {
  const [t, tDemoMe, tCta] = await Promise.all([
    getTranslations('mySettings'),
    getTranslations('demo.me'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-xs text-gray-500 mt-1">{t('description')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoMe('settingsNotice')}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Languages size={11} />
          {t('languageGroup')}
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const isActive = opt.code === ACTIVE_LANGUAGE
            return (
              <DemoActionButton
                key={opt.code}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                    : 'bg-gray-950 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-white'
                }`}
              >
                <span className="text-base">{opt.flag}</span>
                <span>{opt.label}</span>
              </DemoActionButton>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Bell size={11} />
          {t('notificationsGroup')}
        </h2>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-amber-400" />
            <p className="text-white text-sm font-semibold">{tDemoMe('settingsDmEnabled')}</p>
          </div>
          <DemoActionButton
            asDiv
            className="relative inline-flex h-6 w-11 rounded-full bg-emerald-500/40 border border-emerald-500/60 cursor-pointer"
          >
            <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-emerald-300 shadow" />
          </DemoActionButton>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          {DM_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-gray-300">{tDemoMe(cat.labelKey)}</span>
              <DemoActionButton
                asDiv
                className={`relative inline-flex h-5 w-9 rounded-full border cursor-pointer ${
                  cat.enabled
                    ? 'bg-emerald-500/40 border-emerald-500/60'
                    : 'bg-gray-800 border-gray-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3.5 w-3.5 rounded-full shadow transition-all ${
                    cat.enabled
                      ? 'right-0.5 bg-emerald-300'
                      : 'left-0.5 bg-gray-500'
                  }`}
                />
              </DemoActionButton>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-400" />
            <p className="text-white text-sm font-semibold">{tDemoMe('settingsTimezone')}</p>
          </div>
          <DemoActionButton className="w-full text-left bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 hover:border-gray-600 transition-colors flex items-center justify-between gap-3 cursor-pointer">
            <span className="font-mono">Asia/Seoul</span>
            <span className="text-[11px] text-gray-500">{tDemoMe('settingsTimezoneAuto')}</span>
          </DemoActionButton>
        </div>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('settings.title')}
        description={tCta('settings.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
