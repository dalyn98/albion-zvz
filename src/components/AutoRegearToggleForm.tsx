'use client'

// Phase 3 자동 리기어 전역 toggle + 처리 지연 설정.
// - 토글 ON: 이벤트 종료 후 cron 이 killboard victim → AODP → pending 자동 생성.
//           슬롯 편집기에 "자동 리기어 제외" 체크박스가 노출.
// - 토글 OFF: 기존 수동 리기어만 동작. 제외 체크박스도 숨겨짐.
// - 지연(분): 배틀 시작 후 몇 분 뒤 cron 이 이벤트를 처리할지. regear_window_minutes
//            (수동 신청 오픈 시각) 와 분리돼 있어 자동이 먼저 pending 행을 선점.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, BadgeCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialEnabled: boolean
  initialDelayMinutes: number
}

const DELAY_MIN = 5
const DELAY_MAX = 120

export default function AutoRegearToggleForm({ initialEnabled, initialDelayMinutes }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [delayMinutes, setDelayMinutes] = useState(String(initialDelayMinutes))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const delayNum = Number(delayMinutes)
  const delayInvalid =
    !Number.isFinite(delayNum) ||
    !Number.isInteger(delayNum) ||
    delayNum < DELAY_MIN ||
    delayNum > DELAY_MAX
  const dirty =
    enabled !== initialEnabled || delayMinutes !== String(initialDelayMinutes)

  const handleSave = async () => {
    if (delayInvalid) {
      setError(`지연은 ${DELAY_MIN}~${DELAY_MAX} 분 사이 정수여야 합니다.`)
      return
    }
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
    const delayResult = await updateAppSetting('auto_regear_delay_minutes', delayMinutes)
    if (delayResult.error) {
      setError(delayResult.error)
      setLoading(false)
      return
    }
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <BadgeCheck size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">자동 리기어</h2>
          <p className="text-gray-500 text-xs mt-1">
            이벤트 종료 후 킬보드에서 사망 기록을 찾아 AODP 시세로 지급액을 계산해
            pending 상태로 생성합니다. 관리자 승인 전에는 포인트 지급 없음.
            <br />
            요율(리기어 지급률)·AODP 설정을 그대로 따르며, 파티에 배정되지 않은 멤버는 제외됩니다.
            빌드별 제외 체크박스는 이 옵션이 켜져 있을 때만 슬롯 편집기에 나타납니다.
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
          <span className="text-sm text-white font-semibold">자동 리기어 활성화</span>
          <span className="block text-[11px] text-gray-500 mt-0.5">
            끄면 기존 수동 신청 흐름만 동작합니다.
          </span>
        </span>
      </label>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">처리 지연 (분)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={DELAY_MIN}
            max={DELAY_MAX}
            value={delayMinutes}
            onChange={(e) => {
              setDelayMinutes(e.target.value)
              setSaved(false)
            }}
            disabled={!enabled}
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <span className="text-gray-500 text-sm">분</span>
        </div>
        <p className={`text-[11px] mt-1 ${delayInvalid ? 'text-red-400' : 'text-gray-500'}`}>
          배틀 시작 후 이만큼 경과하면 cron 이 해당 이벤트를 처리합니다. 너무 짧으면
          killboard sync 가 따라잡지 못해 victim 이 누락될 수 있습니다. 기본 15분, 범위 {DELAY_MIN}~{DELAY_MAX}.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || delayInvalid}
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
