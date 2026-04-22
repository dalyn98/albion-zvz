'use client'

// Phase 3 자동 리기어 전역 toggle.
// - ON: 이벤트 종료 후 cron 이 killboard victim → AODP → 자동 승인.
//       슬롯 편집기에 "자동 리기어 제외" 체크박스가 노출됨.
// - OFF: 기존 수동 리기어만 동작. 제외 체크박스도 숨겨짐.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, BadgeCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialEnabled: boolean
}

export default function AutoRegearToggleForm({ initialEnabled }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = enabled !== initialEnabled

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('auto_regear_enabled', enabled ? 'true' : 'false')
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <BadgeCheck size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">자동 리기어</h2>
          <p className="text-gray-500 text-xs mt-1">
            이벤트 종료 후 킬보드에서 사망 기록을 찾아 AODP 시세로 지급액을 계산하고 자동 승인합니다.
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
          {loading ? '저장 중…' : '저장'}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">저장됨</span>}
      </div>
    </div>
  )
}
