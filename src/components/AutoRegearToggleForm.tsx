'use client'

// Phase 3 자동 리기어 전역 toggle.
// - 토글 ON: 매칭된 battle_records.ended_at + 10분 + sync 완료 후 cron 이
//           killboard victim → AODP → pending 자동 생성. 슬롯 편집기에
//           "자동 리기어 제외" 체크박스가 노출.
// - 토글 OFF: 기존 수동 리기어만 동작. 제외 체크박스도 숨겨짐.
//
// 처리 시점은 events.battle_started_at(호스트가 누른 버튼) 이 아닌 알비온
// /battles 가 보고하는 실제 전투 종료시각 기준이라 호스트 버튼 부정확성과
// 무관하게 정확히 작동한다 (별도 노브 없음).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, BadgeCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialEnabled: boolean
  embedded?: boolean
}

export default function AutoRegearToggleForm({ initialEnabled, embedded = false }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminAutoRegear')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = enabled !== initialEnabled

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const toggleResult = await updateAppSetting(
      'auto_regear_enabled',
      enabled ? 'true' : 'false',
    )
    if (toggleResult.error) {
      setError(toggleResult.error)
      setLoading(false)
      return
    }
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <BadgeCheck size={16} className="text-amber-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1">
            {t('descriptionLine1')}
            <br />
            {t('descriptionLine2')}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked)
            setSaved(false)
          }}
          className="mt-1 h-4 w-4 accent-amber-500"
        />
        <span>
          <span className="text-sm text-white font-semibold">{t('toggleLabel')}</span>
          <span className="block text-[11px] text-gray-500 mt-0.5">
            {t('toggleHint')}
          </span>
        </span>
      </label>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{tc('saved')}</span>}
      </div>
    </div>
  )
}
