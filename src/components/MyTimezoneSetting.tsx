'use client'

// 길드원 본인 시간대 — 임박 DM 본문의 집결 시각이 이 시간대로 렌더링된다.
// 한국 길드에 가입한 EU/NA 거주자가 본인 지역 시간으로 알람을 받기 위한 설정.
// 길드 운영 시간대(어드민 폼) 와 동일한 알비온 4서버 프리셋만 허용한다.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { setMyTimezone } from '@/app/actions/notifications'
import {
  TENANT_TIMEZONE_OPTIONS,
  getUtcOffsetLabel,
  type TenantTimezoneOption,
} from '@/lib/timezone'
import { useToast } from './ToastProvider'

interface Props {
  initialOverride: string | null
  guildDefaultTimezone: string
  masterEnabled: boolean
}

export default function MyTimezoneSetting({
  initialOverride,
  guildDefaultTimezone,
  masterEnabled,
}: Props) {
  const t = useTranslations('myTimezone')
  const tAdmin = useTranslations('adminTimezone')
  const tDm = useTranslations('discordDm')
  const toast = useToast()
  const router = useRouter()
  const [override, setOverride] = useState<string | null>(initialOverride)
  const [isPending, startTransition] = useTransition()

  const effective = override ?? guildDefaultTimezone
  // 상태/링크 문구에 들어가는 시간대 라벨은 IANA + UTC 오프셋으로 합쳐서 한 번에
  // 보여줘 사용자가 시차를 즉시 인지할 수 있게 함.
  const guildDefaultLabel = `${guildDefaultTimezone} (${getUtcOffsetLabel(guildDefaultTimezone)})`
  const overrideLabel =
    override !== null ? `${override} (${getUtcOffsetLabel(override)})` : null

  const labelFor = (option: TenantTimezoneOption): string => {
    if (option.id === 'kr') return tAdmin('option_kr')
    if (option.id === 'eu') return tAdmin('option_eu')
    if (option.id === 'na') return tAdmin('option_na')
    return tAdmin('option_sa')
  }

  const handleSelect = (iana: string) => {
    if (iana === effective) return
    startTransition(async () => {
      const res = await setMyTimezone(iana)
      if (res.error) {
        toast.error(tDm('updateFailed'))
        return
      }
      setOverride(iana)
      toast.success(t('savedMessage'))
      router.refresh()
    })
  }

  const handleResetToGuildDefault = () => {
    if (override === null) return
    startTransition(async () => {
      const res = await setMyTimezone(null)
      if (res.error) {
        toast.error(tDm('updateFailed'))
        return
      }
      setOverride(null)
      toast.success(t('savedMessage'))
      router.refresh()
    })
  }

  const disabled = !masterEnabled || isPending

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('title')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{t('description')}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed">{t('hint')}</p>

      <div className="grid grid-cols-2 gap-2">
        {TENANT_TIMEZONE_OPTIONS.map((option) => {
          const selected = effective === option.iana
          return (
            <label
              key={option.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              } ${
                selected
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <input
                type="radio"
                name="my-timezone"
                value={option.iana}
                checked={selected}
                disabled={disabled}
                onChange={() => handleSelect(option.iana)}
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

      <div className="flex items-center gap-2 flex-wrap">
        {override !== null && (
          <button
            type="button"
            onClick={handleResetToGuildDefault}
            disabled={disabled}
            className="text-[11px] text-gray-500 hover:text-amber-300 underline disabled:opacity-50"
          >
            {t('resetToGuildDefault', { tz: guildDefaultLabel })}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        {overrideLabel === null
          ? t('statusFollowingGuildDefault', { tz: guildDefaultLabel })
          : t('statusPersonal', { tz: overrideLabel })}
      </p>

      {!masterEnabled && (
        <p className="text-[11px] text-gray-500">{t('disabledHint')}</p>
      )}
    </section>
  )
}
