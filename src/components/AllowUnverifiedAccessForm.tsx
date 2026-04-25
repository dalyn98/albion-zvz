'use client'

// 인증 안 된 길드원 접속 허용 toggle. 기본은 허용(true) — 기존 동작 그대로.
// OFF 로 바꾸면 `src/app/layout.tsx` 게이트가 미인증 멤버를 `/onboarding/albion`
// 으로 강제 리디렉트한다. 관리자/게스트/OAuth 콜백/공개 경로는 항상 제외.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, ShieldCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialAllowed: boolean
  embedded?: boolean
}

export default function AllowUnverifiedAccessForm({ initialAllowed, embedded = false }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminAllowUnverified')
  const [allowed, setAllowed] = useState(initialAllowed)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = allowed !== initialAllowed

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting(
      'allow_unverified_member_access',
      allowed ? 'true' : 'false',
    )
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const containerClass = embedded
    ? 'space-y-2'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <ShieldCheck size={16} className="text-amber-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">
            {t('description')}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allowed}
          onChange={(e) => {
            setAllowed(e.target.checked)
            setSaved(false)
          }}
          className="mt-1 h-4 w-4 accent-amber-500"
        />
        <span>
          <span className="text-sm text-white font-semibold">
            {t('toggleLabel')}
          </span>
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
