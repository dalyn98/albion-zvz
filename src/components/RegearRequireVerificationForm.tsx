'use client'

// 리기어 신청 시 알비온 닉네임 인증 필수 여부.
// - ON: 미인증 길드원이 리기어 신청을 시도하면 거절 + 온보딩 안내 CTA.
// - OFF: 미인증 상태로도 신청 가능 (이전 동작으로 돌아가려 할 때).
// 관리자 토글은 단순 checkbox + 설명 구조.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, ShieldCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialEnabled: boolean
}

export default function RegearRequireVerificationForm({ initialEnabled }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminRegearVerify')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = enabled !== initialEnabled

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting(
      'regear_require_verification',
      enabled ? 'true' : 'false',
    )
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
        <ShieldCheck size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">{t('title')}</h2>
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
