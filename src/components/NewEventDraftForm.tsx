'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
// 이벤트 생성 폼 (draft 전용).
//
// 기존 EventInfoForm 은 제목 + 날짜 + 장소 + 특이사항 + 공지 채널/역할을 모두
// 받았는데, 날짜를 정하기 전에 빌드부터 짜두고 싶다는 피드백 반영해 생성 단계를
// "제목만" 으로 축소. 날짜/장소/특이사항은 편집 화면에서 채우고, 준비되면 "발행"
// 을 눌러 draft → published 로 전이 (publishEvent).

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { createDraftEvent } from '@/app/actions/admin'
import type { TemplateSummary } from '@/app/actions/templates'
import {
  CATEGORY_I18N_SLUG,
  EVENT_RECRUITMENT_MODES,
  EVENT_REGEAR_AUTO_POLICIES,
  EVENT_REGEAR_POLICIES,
  EVENT_REGEAR_VIDEO_POLICIES,
  type EventCategory,
  type EventRegearAutoPolicy,
  type EventRegearPolicy,
  type EventRegearVideoPolicy,
  type EventRecruitmentMode,
} from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'
import {
  DEFAULT_EVENT_REGEAR_AUTO_POLICY,
  DEFAULT_EVENT_REGEAR_POLICY,
  DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
  EVENT_REGEAR_MAX_DEATHS_MAX,
  EVENT_REGEAR_MAX_DEATHS_MIN,
  EVENT_REGEAR_PAYOUT_RATE_MAX,
  EVENT_REGEAR_PAYOUT_RATE_MIN,
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  EVENT_REGEAR_VIDEO_BONUS_MAX,
  EVENT_REGEAR_VIDEO_BONUS_MIN,
  canUseEventRegearPolicy,
  isValidEventRegearMaxDeaths,
  isValidEventRegearPayoutRate,
  isValidEventRegearSilverCap,
  isValidEventRegearVideoBonus,
} from '@/lib/regear-event-policy'

interface Props {
  allowedCategories: EventCategory[]
  canManageRegearPolicy: boolean
  templates: TemplateSummary[]
}

export default function NewEventDraftForm({
  allowedCategories,
  canManageRegearPolicy,
  templates,
}: Props) {
  const router = useRouter()
  const t = useTranslations('adminEventForm')
  const tActionErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const categoryLabelId = useId()
  const recruitmentModeLabelId = useId()
  const participationStatsId = useId()
  const [title, setTitle] = useState('')
  const visibleCategories = allowedCategories
  const [category, setCategory] = useState<EventCategory>(visibleCategories[0] ?? '전투')
  const [recruitmentMode, setRecruitmentMode] = useState<EventRecruitmentMode>('slots')
  const [excludeFromParticipationStats, setExcludeFromParticipationStats] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [regearPolicy, setRegearPolicy] = useState<EventRegearPolicy>(DEFAULT_EVENT_REGEAR_POLICY)
  const [regearSilverCap, setRegearSilverCap] = useState('')
  const [regearMaxDeaths, setRegearMaxDeaths] = useState(String(EVENT_REGEAR_MAX_DEATHS_MIN))
  const [regearVideoPolicy, setRegearVideoPolicy] = useState<EventRegearVideoPolicy>(
    DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
  )
  const [regearVideoPayoutRatePercent, setRegearVideoPayoutRatePercent] = useState('')
  const [regearVideoClaimCeilingBonusSilver, setRegearVideoClaimCeilingBonusSilver] = useState('')
  const [
    regearVideoRateAppliesWithoutProof,
    setRegearVideoRateAppliesWithoutProof,
  ] = useState(false)
  const [regearAutoPolicy, setRegearAutoPolicy] = useState<EventRegearAutoPolicy>(
    DEFAULT_EVENT_REGEAR_AUTO_POLICY,
  )
  const [guestRegearEnabled, setGuestRegearEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const canUseEventPolicy = canUseEventRegearPolicy(category)
  const selectedTemplateName =
    templates.find((template) => template.id === templateId)?.name ?? t('templateNone')
  const quickDraftSummary = {
    template: selectedTemplateName,
    recruitment: t(`recruitmentMode.${recruitmentMode}.title`),
    regear: canUseEventPolicy
      ? t(`eventRegearPolicy.${regearPolicy}.title`)
      : t('eventRegearCombatLockedHint'),
  }

  // 제목 입력만 있어도 "작성 중" 으로 간주. 카테고리만 바꾼 상태는 사용자가
  // 입력한 텍스트가 없으므로 손실 걱정 대상이 아니다.
  useReportDirty(
    'new-event-draft',
    title.trim() !== '' ||
      templateId !== '' ||
      excludeFromParticipationStats ||
      (canManageRegearPolicy &&
        (guestRegearEnabled ||
          (canUseEventPolicy &&
            (regearPolicy !== DEFAULT_EVENT_REGEAR_POLICY ||
              regearSilverCap.trim() !== '' ||
              regearMaxDeaths !== String(EVENT_REGEAR_MAX_DEATHS_MIN) ||
              regearVideoPolicy !== DEFAULT_EVENT_REGEAR_VIDEO_POLICY ||
              regearVideoPayoutRatePercent.trim() !== '' ||
              regearVideoClaimCeilingBonusSilver.trim() !== '' ||
              regearVideoRateAppliesWithoutProof ||
              regearAutoPolicy !== DEFAULT_EVENT_REGEAR_AUTO_POLICY)))),
  )

  const buildRegearPolicyPayload = ():
    | {
        regear_policy: EventRegearPolicy
        regear_silver_cap: number | null
        regear_max_deaths_per_member: number | null
        regear_video_policy: EventRegearVideoPolicy
        regear_video_payout_rate_percent: number | null
        regear_video_claim_ceiling_bonus_silver: number | null
        regear_video_rate_applies_without_proof: boolean
        regear_auto_policy: EventRegearAutoPolicy
        guest_regear_enabled: boolean
      }
    | { error: string } => {
    if (!canManageRegearPolicy) {
      return {
        regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        regear_video_policy: DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
        regear_video_payout_rate_percent: null,
        regear_video_claim_ceiling_bonus_silver: null,
        regear_video_rate_applies_without_proof: false,
        regear_auto_policy: DEFAULT_EVENT_REGEAR_AUTO_POLICY,
        guest_regear_enabled: false,
      }
    }
    if (!canUseEventPolicy) {
      return {
        regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        regear_video_policy: DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
        regear_video_payout_rate_percent: null,
        regear_video_claim_ceiling_bonus_silver: null,
        regear_video_rate_applies_without_proof: false,
        regear_auto_policy: DEFAULT_EVENT_REGEAR_AUTO_POLICY,
        guest_regear_enabled: guestRegearEnabled,
      }
    }
    let videoPayload: {
      regear_video_policy: EventRegearVideoPolicy
      regear_video_payout_rate_percent: number | null
      regear_video_claim_ceiling_bonus_silver: number | null
      regear_video_rate_applies_without_proof: boolean
    }
    if (regearVideoPolicy === 'custom') {
      const videoRate = Number(regearVideoPayoutRatePercent)
      const videoBonus = Number(regearVideoClaimCeilingBonusSilver)
      if (
        regearVideoPayoutRatePercent.trim() === '' ||
        !isValidEventRegearPayoutRate(videoRate)
      ) {
        return { error: t('eventRegearVideoRateInvalid') }
      }
      if (
        regearVideoClaimCeilingBonusSilver.trim() === '' ||
        !isValidEventRegearVideoBonus(videoBonus)
      ) {
        return { error: t('eventRegearVideoBonusInvalid') }
      }
      videoPayload = {
        regear_video_policy: 'custom',
        regear_video_payout_rate_percent: videoRate,
        regear_video_claim_ceiling_bonus_silver: videoBonus,
        regear_video_rate_applies_without_proof: regearVideoRateAppliesWithoutProof,
      }
    } else {
      videoPayload = {
        regear_video_policy: regearVideoPolicy,
        regear_video_payout_rate_percent: null,
        regear_video_claim_ceiling_bonus_silver: null,
        regear_video_rate_applies_without_proof:
          regearVideoPolicy !== 'disabled' && regearVideoRateAppliesWithoutProof,
      }
    }
    if (regearPolicy !== 'event') {
      return {
        regear_policy: regearPolicy,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        ...videoPayload,
        regear_auto_policy: regearAutoPolicy,
        guest_regear_enabled: regearPolicy !== 'disabled' && guestRegearEnabled,
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
      ...videoPayload,
      regear_auto_policy: regearAutoPolicy,
      guest_regear_enabled: guestRegearEnabled,
    }
  }

  const handleSubmit = async () => {
                                     try {
      const trimmed = title.trim()
      if (!trimmed) {
        setError(t('titleRequired'))
        emitUxWorkflowEvent({ eventType: 'validation_failed', metadata: { workflow: 'event_draft', reason: 'title_required' } })
        return
      }
      const regearPayload = buildRegearPolicyPayload()
      if ('error' in regearPayload) {
        setError(regearPayload.error)
        emitUxWorkflowEvent({ eventType: 'validation_failed', metadata: { workflow: 'event_draft', reason: 'policy_invalid' } })
        return
      }
      setError('')
      setLoading(true)
      emitUxWorkflowEvent({ eventType: 'submitted', metadata: { workflow: 'event_draft', stage: 'create' } })
      const result = await createDraftEvent({
        title: trimmed,
        category,
        recruitmentMode,
        excludeFromParticipationStats,
        template_id: templateId || null,
        ...regearPayload,
      })
      if ('error' in result) {
        setError(result.error)
        setLoading(false)
        emitUxWorkflowEvent({ eventType: 'partial_failed', metadata: { workflow: 'event_draft', result: 'server_error' } })
        return
      }
      emitUxWorkflowEvent({ eventType: 'completed', metadata: { workflow: 'event_draft', result: 'success' } })
      // 편집 화면으로 즉시 이동 — 거기서 빌드/파티를 쌓고 나중에 발행.
      router.push(`/admin/dashboard/events/${result.id}`)
                                     } catch (actionError) {
                                       setError(getServerActionClientErrorMessage(actionError, {
                                         expired: tActionErrors('actionExpired'),
                                         fallback: tActionErrors('actionFailed'),
                                       }))
                                     } finally {
                                       setLoading(false)
                                     }
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
        <p id={categoryLabelId} className="text-gray-400 text-xs mb-1 block">{t('categoryLabel')}</p>
        <div
          role="group"
          aria-labelledby={categoryLabelId}
          className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-sm font-semibold"
        >
          {visibleCategories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
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
        <p id={recruitmentModeLabelId} className="text-gray-400 text-xs mb-1 block">{t('recruitmentModeLabel')}</p>
        <div role="group" aria-labelledby={recruitmentModeLabelId} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EVENT_RECRUITMENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRecruitmentMode(mode)}
              aria-pressed={recruitmentMode === mode}
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

      <div className="rounded-lg border border-gray-700 bg-gray-950/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-200">{t('quickDraftSummary')}</p>
            <dl className="mt-2 grid gap-1 text-xs text-gray-400 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-gray-600">{t('templateLabel')}</dt>
                <dd className="mt-0.5 truncate text-gray-200">{quickDraftSummary.template}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-gray-600">{t('recruitmentModeLabel')}</dt>
                <dd className="mt-0.5 text-gray-200">{quickDraftSummary.recruitment}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-gray-600">{t('eventRegearPolicyLabel')}</dt>
                <dd className="mt-0.5 line-clamp-2 text-gray-200">{quickDraftSummary.regear}</dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((current) => !current)}
            aria-expanded={advancedOpen}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-gray-700 px-3 text-xs font-semibold text-gray-200 hover:border-amber-500/50 hover:text-amber-200"
          >
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {advancedOpen ? t('advancedClose') : t('advancedOpen')}
          </button>
        </div>
      </div>

      {advancedOpen && (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
        <label htmlFor={participationStatsId} className="flex cursor-pointer items-start gap-3">
          <input
            id={participationStatsId}
            type="checkbox"
            checked={excludeFromParticipationStats}
            onChange={(event) => setExcludeFromParticipationStats(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <span className="block text-sm font-semibold text-amber-100">
              {t('excludeFromParticipationStatsLabel')}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">
              {t('excludeFromParticipationStatsHint')}
            </span>
          </span>
        </label>
      </div>
      )}

      {templates.length > 0 && (
        <div>
          <label className="text-gray-400 text-xs mb-1 block">{t('templateLabel')}</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{t('templateNone')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">{t('templateHint')}</p>
        </div>
      )}

      {advancedOpen && canManageRegearPolicy && (
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

          <label className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-3">
            <input
              type="checkbox"
              checked={guestRegearEnabled}
              disabled={regearPolicy === 'disabled'}
              onChange={(event) => setGuestRegearEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500 disabled:opacity-40"
            />
            <span>
              <span className="block text-xs font-semibold text-gray-200">
                {t('guestRegearEnabledLabel')}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                {t('guestRegearEnabledHint')}
              </span>
            </span>
          </label>

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

          {canUseEventPolicy && (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearVideoPolicyLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {EVENT_REGEAR_VIDEO_POLICIES.map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => {
                        setRegearVideoPolicy(policy)
                        if (policy === 'disabled') setRegearVideoRateAppliesWithoutProof(false)
                      }}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        regearVideoPolicy === policy
                          ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                          : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-amber-500/40'
                      }`}
                    >
                      <span className="block text-sm font-bold">
                        {t(`eventRegearVideoPolicy.${policy}.title`)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                        {t(`eventRegearVideoPolicy.${policy}.hint`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {regearVideoPolicy !== 'disabled' && (
                <label className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={regearVideoRateAppliesWithoutProof}
                    onChange={(e) => setRegearVideoRateAppliesWithoutProof(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-gray-200">
                      {t('eventRegearVideoRateWithoutProofLabel')}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                      {t('eventRegearVideoRateWithoutProofHint')}
                    </span>
                  </span>
                </label>
              )}

              {regearVideoPolicy === 'custom' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      {t('eventRegearVideoRateLabel')}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={EVENT_REGEAR_PAYOUT_RATE_MIN}
                      max={EVENT_REGEAR_PAYOUT_RATE_MAX}
                      value={regearVideoPayoutRatePercent}
                      onChange={(e) => setRegearVideoPayoutRatePercent(e.target.value)}
                      placeholder={t('eventRegearVideoRatePlaceholder')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      {t('eventRegearVideoRateHint')}
                    </p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">
                      {t('eventRegearVideoBonusLabel')}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={EVENT_REGEAR_VIDEO_BONUS_MIN}
                      max={EVENT_REGEAR_VIDEO_BONUS_MAX}
                      value={regearVideoClaimCeilingBonusSilver}
                      onChange={(e) => setRegearVideoClaimCeilingBonusSilver(e.target.value)}
                      placeholder={t('eventRegearVideoBonusPlaceholder')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      {t('eventRegearVideoBonusHint')}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearAutoPolicyLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {EVENT_REGEAR_AUTO_POLICIES.map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => setRegearAutoPolicy(policy)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        regearAutoPolicy === policy
                          ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                          : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-amber-500/40'
                      }`}
                    >
                      <span className="block text-sm font-bold">
                        {t(`eventRegearAutoPolicy.${policy}.title`)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                        {t(`eventRegearAutoPolicy.${policy}.hint`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
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
        data-create-event-draft
        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
      >
        {loading ? tCommon('saving') : t('draftFormSubmit')}
      </button>
    </div>
  )
}
