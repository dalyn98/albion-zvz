'use client'

// 이벤트 생성 폼 (draft 전용).
//
// 기존 EventInfoForm 은 제목 + 날짜 + 장소 + 특이사항 + 공지 채널/역할을 모두
// 받았는데, 날짜를 정하기 전에 빌드부터 짜두고 싶다는 피드백 반영해 생성 단계를
// "제목만" 으로 축소. 날짜/장소/특이사항은 편집 화면에서 채우고, 준비되면 "발행"
// 을 눌러 draft → published 로 전이 (publishEvent).

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createDraftEvent } from '@/app/actions/admin'
import {
  CATEGORY_I18N_SLUG,
  EVENT_RECRUITMENT_MODES,
  type EventCategory,
  type EventRecruitmentMode,
} from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  allowedCategories: EventCategory[]
}

export default function NewEventDraftForm({ allowedCategories }: Props) {
  const router = useRouter()
  const t = useTranslations('adminEventForm')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const [title, setTitle] = useState('')
  const visibleCategories = allowedCategories
  const [category, setCategory] = useState<EventCategory>(visibleCategories[0] ?? '전투')
  const [recruitmentMode, setRecruitmentMode] = useState<EventRecruitmentMode>('slots')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 제목 입력만 있어도 "작성 중" 으로 간주. 카테고리만 바꾼 상태는 사용자가
  // 입력한 텍스트가 없으므로 손실 걱정 대상이 아니다.
  useReportDirty('new-event-draft', title.trim() !== '')

  const handleSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError(t('titleRequired'))
      return
    }
    setError('')
    setLoading(true)
    const result = await createDraftEvent({ title: trimmed, category, recruitmentMode })
    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }
    // 편집 화면으로 즉시 이동 — 거기서 빌드/파티를 쌓고 나중에 발행.
    router.push(`/admin/dashboard/events/${result.id}`)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <label htmlFor={titleId} className="text-gray-400 text-xs mb-1 block">{t('titleLabel')}</label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) handleSubmit()
          }}
          placeholder={t('titlePlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          autoFocus
        />
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('categoryLabel')}</label>
        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-sm font-semibold">
          {visibleCategories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-md transition-colors ${
                category === c ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t(`category_${CATEGORY_I18N_SLUG[c]}`)}
            </button>
          ))}
        </div>
      <p className="text-xs text-gray-500 mt-1.5">{t('categoryHint')}</p>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('recruitmentModeLabel')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EVENT_RECRUITMENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRecruitmentMode(mode)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                recruitmentMode === mode
                  ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-amber-500/40'
              }`}
            >
              <span className="block text-sm font-bold">{t(`recruitmentMode.${mode}.title`)}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                {t(`recruitmentMode.${mode}.hint`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">{t('draftFormHint')}</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !title.trim()}
        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
      >
        {loading ? tCommon('saving') : t('draftFormSubmit')}
      </button>
    </div>
  )
}
