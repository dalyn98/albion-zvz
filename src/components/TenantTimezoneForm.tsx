'use client'

// 길드 운영 시간대 — 알비온 4개 서버 프리셋(KR/EU/NA/SA) 중 하나로 저장.
// 변경하면 이벤트 집결시간 표시, 리더보드/streak 일자 경계, 디스코드 공지 본문의
// 시각 라벨이 새 시간대로 렌더링된다 (재로그인/다음 SSR 부터). 잘못된 IANA 가
// 들어와도 helper 가 'Asia/Seoul' 로 degrade 하므로 데이터는 깨지지 않는다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Clock } from 'lucide-react'
import { updateTenantTimezone } from '@/app/actions/settings'
import {
  TENANT_TIMEZONE_OPTIONS,
  getUtcOffsetLabel,
  type TenantTimezoneOption,
} from '@/lib/timezone'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialTimezone: string
  embedded?: boolean
}

export default function TenantTimezoneForm({ initialTimezone, embedded = false }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminTimezone')
  const [timezone, setTimezone] = useState(initialTimezone)
  const [savedTimezone, setSavedTimezone] = useState(initialTimezone)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = timezone !== savedTimezone
  useReportDirty('tenant-timezone', dirty)

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateTenantTimezone(timezone)
    if (result.error) {
      setError(result.error)
    } else {
      setSavedTimezone(timezone)
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const labelFor = (option: TenantTimezoneOption): string => {
    if (option.id === 'kr') return t('option_kr')
    if (option.id === 'eu') return t('option_eu')
    if (option.id === 'na') return t('option_na')
    return t('option_sa')
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <Clock size={16} className="text-amber-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">{t('description')}</p>
          <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">{t('hint')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TENANT_TIMEZONE_OPTIONS.map((option) => {
          const selected = timezone === option.iana
          return (
            <label
              key={option.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                selected
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <input
                type="radio"
                name="tenant-timezone-admin"
                value={option.iana}
                checked={selected}
                onChange={() => {
                  setTimezone(option.iana)
                  setSaved(false)
                }}
                className="accent-amber-500"
              />
              <span className="flex-1">{labelFor(option)}</span>
              <span className="text-[11px] font-mono text-amber-300/80">
                {getUtcOffsetLabel(option.iana)}
              </span>
              <span className="text-[11px] text-gray-500">{option.iana}</span>
            </label>
          )
        })}
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
