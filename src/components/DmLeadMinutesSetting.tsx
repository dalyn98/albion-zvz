'use client'

import { useState, useTransition } from 'react'
import { Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { setMyDmLeadMinutes } from '@/app/actions/notifications'
import { useToast } from './ToastProvider'

// 사용자가 직접 고를 수 있는 분 옵션. 길드 기본값과 동일한 라인업을 쓴다.
const LEAD_OPTIONS = [5, 15, 35, 60, 120, 240, 720, 1440] as const

interface Props {
  initialOverride: number | null
  guildDefaultMinutes: number
  masterEnabled: boolean
}

// /me/settings 의 "DM 알림 리드타임" 셀렉트. value === '' 는 길드 기본값을
// 사용하라는 의미(서버에 null 로 저장).
export default function DmLeadMinutesSetting({
  initialOverride,
  guildDefaultMinutes,
  masterEnabled,
}: Props) {
  const t = useTranslations('discordDm')
  const toast = useToast()
  const [override, setOverride] = useState<number | null>(initialOverride)
  const [isPending, startTransition] = useTransition()

  const handleChange = (raw: string) => {
    const next = raw === '' ? null : Number(raw)
    if (next !== null && !Number.isInteger(next)) return
    startTransition(async () => {
      const previous = override
      setOverride(next)
      const res = await setMyDmLeadMinutes(next)
      if (res.error) {
        setOverride(previous)
        toast.error(t('updateFailed'))
        return
      }
      toast.success(t('leadSavedMessage'))
    })
  }

  const select = (
    <select
      value={override === null ? '' : String(override)}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending || !masterEnabled}
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-60"
    >
      <option value="">
        {t('leadFollowGuildDefault', { minutes: guildDefaultMinutes })}
      </option>
      {LEAD_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {t('leadOption', { minutes: m })}
        </option>
      ))}
    </select>
  )

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('leadTitle')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        {t('leadDescription', { minutes: guildDefaultMinutes })}
      </p>
      {select}
      {!masterEnabled && (
        <p className="text-[11px] text-gray-500">{t('leadDisabledHint')}</p>
      )}
    </section>
  )
}
