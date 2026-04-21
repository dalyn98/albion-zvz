'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getMyDmPreference, setMyDmPreference } from '@/app/actions/notifications'
import { useToast } from './ToastProvider'

// /me/settings 의 Discord DM 수신 토글. 서버 DB 의 discord_dm_enabled 플래그를
// 단일 요청으로 업데이트한다. SW/브라우저 권한 없이 동작.

type Status = 'loading' | 'on' | 'off'

interface Props {
  initialEnabled: boolean
}

export default function DmToggle({ initialEnabled }: Props) {
  const t = useTranslations('discordDm')
  const toast = useToast()
  const [status, setStatus] = useState<Status>(initialEnabled ? 'on' : 'off')

  useEffect(() => {
    // 서버 상태가 props 와 다를 수 있는 경우 (예: 탭 간 토글)
    // 마운트 시 한번 재조회해서 정합 맞춘다.
    void (async () => {
      const res = await getMyDmPreference()
      if (!res.error) setStatus(res.enabled ? 'on' : 'off')
    })()
  }, [])

  const update = async (next: boolean) => {
    setStatus('loading')
    const res = await setMyDmPreference(next)
    if (res.error) {
      toast.error(t('updateFailed'))
      setStatus(next ? 'off' : 'on')
      return
    }
    setStatus(next ? 'on' : 'off')
    if (next) {
      toast.success(t('enabledMessage'))
    } else {
      toast.info(t('disabledMessage'))
    }
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('title')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{t('description')}</p>

      {status === 'off' && (
        <button
          type="button"
          onClick={() => update(true)}
          className="inline-flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-2 rounded-lg"
        >
          <Bell size={13} />
          {t('enableButton')}
        </button>
      )}

      {status === 'loading' && (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
        >
          {t('loading')}
        </button>
      )}

      {status === 'on' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-full">
            <BellRing size={12} />
            {t('enabledBadge')}
          </span>
          <button
            type="button"
            onClick={() => update(false)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-rose-300 font-semibold"
          >
            <BellOff size={12} />
            {t('disableButton')}
          </button>
        </div>
      )}
    </section>
  )
}
