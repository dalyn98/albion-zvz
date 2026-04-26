'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { setMyDmLeadMinutes } from '@/app/actions/notifications'
import { useToast } from './ToastProvider'

// 어드민 폼과 동일한 라인업. 셀렉트가 아닌 숫자 입력 + 프리셋 칩으로 통일해
// "내 알림 시점 = 분 단위 직접 설정" 일관 UX 를 제공한다.
const LEAD_OPTIONS = [5, 15, 35, 60, 120, 240, 720, 1440] as const
const LEAD_MIN = 5
const LEAD_MAX = 1440

interface Props {
  initialOverride: number | null
  guildDefaultMinutes: number
  masterEnabled: boolean
}

export default function DmLeadMinutesSetting({
  initialOverride,
  guildDefaultMinutes,
  masterEnabled,
}: Props) {
  const t = useTranslations('discordDm')
  const toast = useToast()
  const router = useRouter()
  const inputId = useId()

  // override 가 null 이면 현재 적용되는 시간 = 길드 기본값. 입력은 항상 숫자.
  const initialValue = initialOverride ?? guildDefaultMinutes
  const [override, setOverride] = useState<number | null>(initialOverride)
  const [minutes, setMinutes] = useState(String(initialValue))
  const [isPending, startTransition] = useTransition()

  const num = Number(minutes)
  const invalid =
    !Number.isFinite(num) ||
    !Number.isInteger(num) ||
    num < LEAD_MIN ||
    num > LEAD_MAX
  // 사용자가 현재 저장된 효과값과 동일한 값을 다시 누르는 건 의미 없음.
  const currentEffective = override ?? guildDefaultMinutes
  const dirty = !invalid && num !== currentEffective

  const handleSave = () => {
    if (invalid || !dirty) return
    startTransition(async () => {
      const res = await setMyDmLeadMinutes(num)
      if (res.error) {
        toast.error(t('updateFailed'))
        return
      }
      setOverride(num)
      toast.success(t('leadSavedMessage'))
      router.refresh()
    })
  }

  const handleResetToGuildDefault = () => {
    if (override === null) return
    startTransition(async () => {
      const res = await setMyDmLeadMinutes(null)
      if (res.error) {
        toast.error(t('updateFailed'))
        return
      }
      setOverride(null)
      setMinutes(String(guildDefaultMinutes))
      toast.success(t('leadSavedMessage'))
      router.refresh()
    })
  }

  const disabled = !masterEnabled || isPending

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('leadTitle')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        {t('leadDescription', { minutes: guildDefaultMinutes })}
      </p>

      <div>
        <label htmlFor={inputId} className="text-gray-400 text-xs mb-1 block">
          {t('leadInputLabel')}
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id={inputId}
            type="number"
            min={LEAD_MIN}
            max={LEAD_MAX}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={disabled}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-28 focus:outline-none focus:border-amber-500 disabled:opacity-60"
          />
          <span className="text-xs text-gray-500">{t('leadUnit')}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-2">
          {LEAD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(String(m))}
              disabled={disabled}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                num === m
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {t('leadOption', { minutes: m })}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || !dirty || invalid}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {isPending ? t('leadSaving') : t('leadSave')}
        </button>
        {override !== null && (
          <button
            type="button"
            onClick={handleResetToGuildDefault}
            disabled={disabled}
            className="text-[11px] text-gray-500 hover:text-amber-300 underline disabled:opacity-50"
          >
            {t('leadResetToGuildDefault', { minutes: guildDefaultMinutes })}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        {override === null
          ? t('leadStatusFollowingGuildDefault', { minutes: guildDefaultMinutes })
          : t('leadStatusPersonal', { minutes: override })}
      </p>

      {!masterEnabled && (
        <p className="text-[11px] text-gray-500">{t('leadDisabledHint')}</p>
      )}
    </section>
  )
}
