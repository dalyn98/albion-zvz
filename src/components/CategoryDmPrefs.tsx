'use client'

import { useState, useTransition } from 'react'
import { Bell, BellOff, Swords, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { setMyCategoryPreference } from '@/app/actions/notifications'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import { useToast } from './ToastProvider'

interface Props {
  initialCombat: boolean
  initialOther: boolean
  // DM 마스터 스위치가 꺼져 있으면 카테고리 토글은 무의미하지만 상태는 미리
  // 설정할 수 있도록 비활성화된 UI 로 렌더링한다.
  masterEnabled: boolean
}

export default function CategoryDmPrefs({
  initialCombat,
  initialOther,
  masterEnabled,
}: Props) {
  const t = useTranslations('discordDm')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [combat, setCombat] = useState(initialCombat)
  const [other, setOther] = useState(initialOther)

  const toggle = (category: EventCategory, next: boolean) => {
    const prev = category === '전투' ? combat : other
    if (category === '전투') setCombat(next)
    else setOther(next)

    startTransition(async () => {
      const res = await setMyCategoryPreference(category, next)
      if (res.error) {
        // 롤백 — 서버 실패 시 UI 상태도 원복.
        if (category === '전투') setCombat(prev)
        else setOther(prev)
        toast.error(t('updateFailed'))
      }
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('categoryTitle')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{t('categoryDescription')}</p>

      <div className="space-y-2">
        {EVENT_CATEGORIES.map((c) => {
          const value = c === '전투' ? combat : other
          const labelKey = c === '전투' ? 'category_combat' : 'category_other'
          const Icon = c === '전투' ? Swords : Sparkles
          return (
            <button
              key={c}
              type="button"
              disabled={pending || !masterEnabled}
              onClick={() => toggle(c, !value)}
              className={`w-full flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                value && masterEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15'
                  : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className={value && masterEnabled ? 'text-emerald-300' : 'text-gray-500'} />
                <span className={`text-sm font-semibold ${value && masterEnabled ? 'text-emerald-200' : 'text-gray-300'}`}>
                  {t(labelKey)}
                </span>
              </div>
              {value ? (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  masterEnabled ? 'text-emerald-300' : 'text-gray-500'
                }`}>
                  <Bell size={11} />
                  {t('categoryOn')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500">
                  <BellOff size={11} />
                  {t('categoryOff')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!masterEnabled && (
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          {t('categoryMasterOff')}
        </p>
      )}
    </section>
  )
}
