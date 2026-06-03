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
  EVENT_REGEAR_POLICIES,
  type EventCategory,
  type EventRegearPolicy,
  type EventRecruitmentMode,
} from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'
import {
  DEFAULT_EVENT_REGEAR_POLICY,
  EVENT_REGEAR_MAX_DEATHS_MAX,
  EVENT_REGEAR_MAX_DEATHS_MIN,
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  canUseEventRegearPolicy,
  isValidEventRegearMaxDeaths,
  isValidEventRegearSilverCap,
} from '@/lib/regear-event-policy'

interface Props {
  allowedCategories: EventCategory[]
  canManageRegearPolicy: boolean
}

export default function NewEventDraftForm({ allowedCategories, canManageRegearPolicy }: Props) {
  const router = useRouter()
  const t = useTranslations('adminEventForm')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const [title, setTitle] = useState('')
  const visibleCategories = allowedCategories
  const [category, setCategory] = useState<EventCategory>(visibleCategories[0] ?? '전투')
  const [recruitmentMode, setRecruitmentMode] = useState<EventRecruitmentMode>('slots')
  const [regearPolicy, setRegearPolicy] = useState<EventRegearPolicy>(DEFAULT_EVENT_REGEAR_POLICY)
  const [regearSilverCap, setRegearSilverCap] = useState('')
  const [regearMaxDeaths, setRegearMaxDeaths] = useState(String(EVENT_REGEAR_MAX_DEATHS_MIN))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canUseEventPolicy = canUseEventRegearPolicy(category)

  // 제목 입력만 있어도 "작성 중" 으로 간주. 카테고리만 바꾼 상태는 사용자가
  // 입력한 텍스트가 없으므로 손실 걱정 대상이 아니다.
  useReportDirty(
    'new-event-draft',
    title.trim() !== '' ||
      (canManageRegearPolicy &&
        canUseEventPolicy &&
        (regearPolicy !== DEFAULT_EVENT_REGEAR_POLICY ||
          regearSilverCap.trim() !== '' ||
          regearMaxDeaths !== String(EVENT_REGEAR_MAX_DEATHS_MIN))),
  )

  const buildRegearPolicyPayload = ():
    | {
        regear_policy: EventRegearPolicy
        regear_silver_cap: number | null
        regear_max_deaths_per_member: number | null
      }
    | { error: string } => {
    if (!canManageRegearPolicy || !canUseEventPolicy) {
      return {
        regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
      }
    }
    if (regearPolicy !== 'event') {
      return {
        regear_policy: regearPolicy,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
      }
    }
    const silverCap = Number(regearSilverCap)
    if (!isValidEventRegearSilverCap(silverCap)) {
      return { error: t('eventRegearSilverCapInvalid') }
    }
    const maxDeaths = Number(regearMaxDeaths)
    if (!isValidEventRegearMaxDeaths(maxDeaths)) {
      return { error: t('eventRegearMaxDeathsInvalid') }
    }
    return {
      regear_policy: 'event',
      regear_silver_cap: silverCap,
      regear_max_deaths_per_member: maxDeaths,
    }
  }

  const handleSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError(t('titleRequired'))
      return
    }
    const regearPayload = buildRegearPolicyPayload()
    if ('error' in regearPayload) {
      setError(regearPayload.error)
      return
    }
    setError('')
    setLoading(true)
    const result = await createDraftEvent({ title: trimmed, category, recruitmentMode, ...regearPayload })
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

      {canManageRegearPolicy && (
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">{t('eventRegearPolicyLabel')}</label>
            {canUseEventPolicy ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EVENT_REGEAR_POLICIES.map((policy) => (
                  <button
                    key={policy}
                    type="button"
                    onClick={() => setRegearPolicy(policy)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      regearPolicy === policy
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-amber-500/40'
                    }`}
                  >
                    <span className="block text-sm font-bold">{t(`eventRegearPolicy.${policy}.title`)}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                      {t(`eventRegearPolicy.${policy}.hint`)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-xs text-gray-400">
                {t('eventRegearCombatLockedHint')}
              </p>
            )}
          </div>

          {canUseEventPolicy && regearPolicy === 'event' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearSilverCapLabel')}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={EVENT_REGEAR_SILVER_CAP_MIN}
                  max={EVENT_REGEAR_SILVER_CAP_MAX}
                  value={regearSilverCap}
                  onChange={(e) => setRegearSilverCap(e.target.value)}
                  placeholder={t('eventRegearSilverCapPlaceholder')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">{t('eventRegearSilverCapHint')}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearMaxDeathsLabel')}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={EVENT_REGEAR_MAX_DEATHS_MIN}
                  max={EVENT_REGEAR_MAX_DEATHS_MAX}
                  value={regearMaxDeaths}
                  onChange={(e) => setRegearMaxDeaths(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  {t('eventRegearMaxDeathsHint', {
                    min: EVENT_REGEAR_MAX_DEATHS_MIN,
                    max: EVENT_REGEAR_MAX_DEATHS_MAX,
                  })}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

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
