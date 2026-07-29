'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useEffect, useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createEvent, updateEvent } from '@/app/actions/admin'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
import { useRegisterSave, useReportDirty } from './EventEditSaveRegistry'
import {
  listGuildRoles,
  listGuildChannels,
  type DiscordRoleOption,
  type DiscordChannelOption,
} from '@/app/actions/notifications'
import {
  defaultGatherParts,
  formatGatherTimeFor,
  formatGatherTimeKo,
  parseGatherTime,
  type GatherTimeParts,
} from '@/lib/gather-time'
import FourPartTimeInput from './FourPartTimeInput'
import type { Locale } from '@/i18n/locales'
import type {
  Event,
  EventCategory,
  EventRegearAutoPolicy,
  EventRegearPolicy,
  EventRegearVideoPolicy,
  EventRecruitmentMode,
} from '@/types'
import {
  CATEGORY_I18N_SLUG,
  EVENT_CATEGORIES,
  EVENT_RECRUITMENT_MODES,
  EVENT_REGEAR_AUTO_POLICIES,
  EVENT_REGEAR_POLICIES,
  EVENT_REGEAR_VIDEO_POLICIES,
} from '@/types'
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
  initialEvent?: Event
  tenantTimezone: string
  canManageRegearPolicy: boolean
  regearPolicyLocked?: boolean
}

export default function EventInfoForm({
  initialEvent,
  tenantTimezone,
  canManageRegearPolicy,
  regearPolicyLocked = false,
}: Props) {
  const router = useRouter()
  const locale = useLocale() as Locale
  const t = useTranslations('adminEventForm')
  const tActionErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const locationId = useId()
  const notesId = useId()
  const channelId = useId()
  const roleId = useId()
  const categoryLabelId = useId()
  const recruitmentModeLabelId = useId()
  const participationStatsId = useId()
  const regearSilverCapId = useId()
  const regearMaxDeathsId = useId()
  const regearVideoRateId = useId()
  const regearVideoBonusId = useId()
  const isEdit = !!initialEvent
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [parts, setParts] = useState<GatherTimeParts>(() =>
    defaultGatherParts(initialEvent?.gather_at ?? null),
  )
  const [gatherLocation, setGatherLocation] = useState(initialEvent?.gather_location ?? '')
  const [specialNotes, setSpecialNotes] = useState(initialEvent?.special_notes ?? '')
  const [notifyRoleId, setNotifyRoleId] = useState<string>(initialEvent?.notify_role_id ?? '')
  const [notifyChannelId, setNotifyChannelId] = useState<string>(initialEvent?.notify_channel_id ?? '')
  const [notifyEveryone, setNotifyEveryone] = useState<boolean>(initialEvent?.notify_everyone ?? false)
  const [category, setCategory] = useState<EventCategory>(initialEvent?.category ?? '전투')
  const [recruitmentMode, setRecruitmentMode] = useState<EventRecruitmentMode>(
    initialEvent?.recruitment_mode ?? 'slots',
  )
  const [excludeFromParticipationStats, setExcludeFromParticipationStats] = useState(
    initialEvent?.exclude_from_participation_stats ?? false,
  )
  const [regearPolicy, setRegearPolicy] = useState<EventRegearPolicy>(
    initialEvent?.regear_policy ?? DEFAULT_EVENT_REGEAR_POLICY,
  )
  const [regearSilverCap, setRegearSilverCap] = useState(
    initialEvent?.regear_silver_cap ? String(initialEvent.regear_silver_cap) : '',
  )
  const [regearMaxDeaths, setRegearMaxDeaths] = useState(
    String(initialEvent?.regear_max_deaths_per_member ?? EVENT_REGEAR_MAX_DEATHS_MIN),
  )
  const [regearVideoPolicy, setRegearVideoPolicy] = useState<EventRegearVideoPolicy>(
    initialEvent?.regear_video_policy ?? DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
  )
  const [regearVideoPayoutRatePercent, setRegearVideoPayoutRatePercent] = useState(
    initialEvent?.regear_video_payout_rate_percent
      ? String(initialEvent.regear_video_payout_rate_percent)
      : '',
  )
  const [regearVideoClaimCeilingBonusSilver, setRegearVideoClaimCeilingBonusSilver] = useState(
    initialEvent?.regear_video_claim_ceiling_bonus_silver != null
      ? String(initialEvent.regear_video_claim_ceiling_bonus_silver)
      : '',
  )
  const [
    regearVideoRateAppliesWithoutProof,
    setRegearVideoRateAppliesWithoutProof,
  ] = useState(initialEvent?.regear_video_rate_applies_without_proof ?? false)
  const [regearAutoPolicy, setRegearAutoPolicy] = useState<EventRegearAutoPolicy>(
    initialEvent?.regear_auto_policy ?? DEFAULT_EVENT_REGEAR_AUTO_POLICY,
  )
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [rolesError, setRolesError] = useState(false)
  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null)
  const [channelsError, setChannelsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // 생성 모드 전용 확인 모달 상태. 편집 모드에서는 사용하지 않는다.
  // 생성은 "미리보기 → 저장" 2단계 — 폼 입력이 끝나도 명시적으로 저장을
  // 한 번 더 눌러야 DB 에 실제로 insert 된다.
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    // 생성 폼은 공지 관련 UI 가 없으므로 역할/채널 조회 자체를 건너뛴다.
    // 편집 단계에서만 봇 토큰으로 Discord API 를 1회 호출.
    if (!isEdit) return
    void (async () => {
      const [rolesRes, channelsRes] = await Promise.all([
        listGuildRoles(),
        listGuildChannels(),
      ])
      if (rolesRes.error) setRolesError(true)
      else setRoles(rolesRes.roles)
      if (channelsRes.error) setChannelsError(true)
      else setChannels(channelsRes.channels)
    })()
  }, [isEdit])

  // 모달 열린 동안 배경 스크롤을 잠그고 ESC 로 닫기. 저장 중에는 ESC 무시.
  useEffect(() => {
    if (!confirmOpen) return
    const releaseScrollLock = acquireBodyScrollLock()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) setConfirmOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      releaseScrollLock()
      document.removeEventListener('keydown', onKey)
    }
  }, [confirmOpen, loading])

  const parsed = parseGatherTime(parts, { timezone: tenantTimezone })
  const preview = parsed ? formatGatherTimeFor(locale, parsed, tenantTimezone) : null
  const canUseEventPolicy = canUseEventRegearPolicy(category)

  const partLabels = {
    month: t('partMonth'),
    day: t('partDay'),
    hour: t('partHour'),
    minute: t('partMinute'),
  }

  // 폼 → 실제 DB 호출에 쓰는 payload 를 한번에 조립. validate 에서 파싱한
  // Date 를 그대로 받아 다시 파싱하는 일 없이 재사용한다.
  // 결과는 { dt } 또는 { error } — error 상태는 호출측에서 별도로 setError 한다.
  // 장소는 운영상 TBD 일 수 있어 발행/저장 모두 optional 로 둔다.
  const validate = (): { dt: Date } | { error: string } => {
    if (!title.trim()) return { error: t('titleRequired') }
    const dt = parseGatherTime(parts, {
      referenceIso: initialEvent?.gather_at ?? null,
      timezone: tenantTimezone,
    })
    if (!dt) return { error: t('gatherTimeInvalid') }
    return { dt }
  }

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
      }
    | { error: string } => {
    if (regearPolicyLocked && initialEvent) {
      return {
        regear_policy: initialEvent.regear_policy,
        regear_silver_cap: initialEvent.regear_silver_cap,
        regear_max_deaths_per_member: initialEvent.regear_max_deaths_per_member,
        regear_video_policy: initialEvent.regear_video_policy,
        regear_video_payout_rate_percent:
          initialEvent.regear_video_payout_rate_percent,
        regear_video_claim_ceiling_bonus_silver:
          initialEvent.regear_video_claim_ceiling_bonus_silver,
        regear_video_rate_applies_without_proof:
          initialEvent.regear_video_rate_applies_without_proof,
        regear_auto_policy: initialEvent.regear_auto_policy,
      }
    }
    if (!canManageRegearPolicy || !canUseEventPolicy) {
      return {
        regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        regear_video_policy: DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
        regear_video_payout_rate_percent: null,
        regear_video_claim_ceiling_bonus_silver: null,
        regear_video_rate_applies_without_proof: false,
        regear_auto_policy: DEFAULT_EVENT_REGEAR_AUTO_POLICY,
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
    }
  }

  // Draft 편집 시에는 날짜 / 장소가 비어 있어도 저장이 되어야 한다 (publishEvent
  // 시점에 strict 검증). 이 버전은 제목만 필수로 체크하고 나머지는 채워진 만큼
  // 담아 반환한다. 값이 비면 빈 문자열 / null 로 남겨둬 서버 쪽에서 draft-tolerant
  // validateEventPayload 가 통과시키도록 한다.
  const validateDraft = ():
    | { title: string; dtIso: string | ''; gatherTimeKo: string; location: string }
    | { error: string } => {
    if (!title.trim()) return { error: t('titleRequired') }
    const dt = parseGatherTime(parts, {
      referenceIso: initialEvent?.gather_at ?? null,
      timezone: tenantTimezone,
    })
    // dt 가 NaN 이면 아예 날짜를 비워 저장. 유효한 date 가 있으면 같이 저장.
    const dtIso = dt ? dt.toISOString() : ''
    const gatherTimeKo = dt ? formatGatherTimeKo(dt, tenantTimezone) : ''
    return { title: title.trim(), dtIso, gatherTimeKo, location: gatherLocation.trim() }
  }

  // 생성 버튼은 확인 모달을 띄우는 1차 단계. 편집 모드에서는 렌더되지 않는다.
  const openConfirm = () => {
    const v = validate()
    if ('error' in v) {
      setError(v.error)
      return
    }
    const regearPayload = buildRegearPolicyPayload()
    if ('error' in regearPayload) {
      setError(regearPayload.error)
      return
    }
    setError('')
    setConfirmOpen(true)
  }

  const commitCreate = async () => {
                                     try {
      const v = validate()
      if ('error' in v) {
        setError(v.error)
        setConfirmOpen(false)
        return
      }
      setError('')
      setLoading(true)
      const regearPayload = buildRegearPolicyPayload()
      if ('error' in regearPayload) {
        setError(regearPayload.error)
        setConfirmOpen(false)
        setLoading(false)
        return
      }
      // 생성 단계에서는 공지 대상(역할/채널) 을 보내지 않는다. 생성 후
      // 편집 화면에서 고르는 흐름.
      const result = await createEvent({
        title: title.trim(),
        gather_at: v.dt.toISOString(),
        gather_time: formatGatherTimeKo(v.dt, tenantTimezone),
        gather_location: gatherLocation.trim(),
        special_notes: specialNotes.trim() || null,
        category,
        recruitment_mode: recruitmentMode,
        exclude_from_participation_stats: excludeFromParticipationStats,
        ...regearPayload,
      })
      if ('error' in result && result.error) {
        setError(result.error)
        setConfirmOpen(false)
        setLoading(false)
        return
      }
      if ('id' in result) {
        router.push(`/admin/dashboard/events/${result.id}`)
      }
                                     } catch (actionError) {
                                       setError(getServerActionClientErrorMessage(actionError, {
                                         expired: tActionErrors('actionExpired'),
                                         fallback: tActionErrors('actionFailed'),
                                       }))
                                     } finally {
                                       setLoading(false)
                                     }
                                   }

  // 편집 모드 dirty 추적: 마운트 시점의 입력 (= initialEvent 와 동일) 을
  // 직렬화해 두고 현재 입력과 비교. 저장 성공 시 ref 를 갱신해 다시 clean 으로
  // 만든다 — initialEvent prop 은 router.refresh 후에야 새 값을 받으므로
  // 그 사이의 dirty 오탐을 막는다.
  const computeSnapshot = (): string =>
    JSON.stringify({
      title,
      parts,
      gatherLocation,
      specialNotes,
      notifyRoleId,
      notifyChannelId,
      notifyEveryone,
      category,
      recruitmentMode,
      excludeFromParticipationStats,
      ...(canManageRegearPolicy
        ? {
            regearPolicy,
            regearSilverCap,
            regearMaxDeaths,
            regearVideoPolicy,
            regearVideoPayoutRatePercent,
            regearVideoClaimCeilingBonusSilver,
            regearVideoRateAppliesWithoutProof,
            regearAutoPolicy,
          }
        : {}),
    })
  const [cleanSnapshot, setCleanSnapshot] = useState<string>(() => computeSnapshot())
  const currentSnapshot = useMemo(
    () => computeSnapshot(),
    // computeSnapshot 은 closure 로 모든 입력을 참조.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, parts, gatherLocation, specialNotes, notifyRoleId, notifyChannelId, notifyEveryone, category, recruitmentMode, excludeFromParticipationStats, canManageRegearPolicy, regearPolicy, regearSilverCap, regearMaxDeaths, regearVideoPolicy, regearVideoPayoutRatePercent, regearVideoClaimCeilingBonusSilver, regearVideoRateAppliesWithoutProof, regearAutoPolicy],
  )
  const isDirty = isEdit && currentSnapshot !== cleanSnapshot
  useReportDirty('event-info', isDirty)

  // 편집 모드에서만 상위 저장 바에 자신을 등록. 생성 모드는 기존 모달 흐름.
  // draft 이벤트는 날짜 / 장소가 비어 있어도 저장되어야 하므로 validateDraft 사용.
  // published 이벤트는 strict 검증 유지 — 이미 공개된 값이 비는 건 허용 불가.
  useRegisterSave(
    'event-info',
    t('sectionTitle'),
    async () => {
      if (!initialEvent) return {}
      const snapshotAtSave = currentSnapshot
      const isDraft = initialEvent.status === 'draft'
      if (isDraft) {
        const v = validateDraft()
        if ('error' in v) {
          setError(v.error)
          return { error: v.error }
        }
        const regearPayload = buildRegearPolicyPayload()
        if ('error' in regearPayload) {
          setError(regearPayload.error)
          return { error: regearPayload.error }
        }
        const result = await updateEvent(initialEvent.id, {
          title: v.title,
          gather_at: v.dtIso,
          gather_time: v.gatherTimeKo,
          gather_location: v.location,
          special_notes: specialNotes.trim() || null,
          notify_role_id: notifyRoleId || null,
          notify_channel_id: notifyChannelId || null,
          notify_everyone: notifyEveryone,
          category,
          recruitment_mode: recruitmentMode,
          exclude_from_participation_stats: excludeFromParticipationStats,
          ...regearPayload,
        })
        if ('error' in result && result.error) {
          setError(result.error)
          return { error: result.error }
        }
        setError('')
        setCleanSnapshot(snapshotAtSave)
        return {}
      }
      const v = validate()
      if ('error' in v) {
        setError(v.error)
        return { error: v.error }
      }
      const regearPayload = buildRegearPolicyPayload()
      if ('error' in regearPayload) {
        setError(regearPayload.error)
        return { error: regearPayload.error }
      }
      const result = await updateEvent(initialEvent.id, {
        title: title.trim(),
        gather_at: v.dt.toISOString(),
        gather_time: formatGatherTimeKo(v.dt, tenantTimezone),
        gather_location: gatherLocation.trim(),
        special_notes: specialNotes.trim() || null,
        notify_role_id: notifyRoleId || null,
        notify_channel_id: notifyChannelId || null,
        notify_everyone: notifyEveryone,
        category,
        recruitment_mode: recruitmentMode,
        exclude_from_participation_stats: excludeFromParticipationStats,
        ...regearPayload,
      })
      if ('error' in result && result.error) {
        setError(result.error)
        return { error: result.error }
      }
      setError('')
      setCleanSnapshot(snapshotAtSave)
      return {}
    },
    isEdit,
  )

  return (
    <div
      id={isEdit ? 'event-save-event-info' : undefined}
      className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4"
    >
      <h2 className="font-bold text-white">{t('sectionTitle')}</h2>

      <div>
        <label htmlFor={titleId} className="text-gray-400 text-xs mb-1 block">{t('titleLabel')}</label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <p id={categoryLabelId} className="text-gray-400 text-xs mb-1 block">{t('categoryLabel')}</p>
        <div
          role="group"
          aria-labelledby={categoryLabelId}
          className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-sm font-semibold"
        >
          {EVENT_CATEGORIES.map((c) => (
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

      {canManageRegearPolicy && (
        <fieldset
          disabled={regearPolicyLocked}
          className="border-t border-gray-800 pt-4 space-y-3 disabled:opacity-70"
        >
          {regearPolicyLocked && (
            <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-200">
              {t('eventRegearPolicyLockedHint')}
            </p>
          )}
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
                <label htmlFor={regearSilverCapId} className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearSilverCapLabel')}
                </label>
                <input
                  id={regearSilverCapId}
                  type="number"
                  inputMode="numeric"
                  min={EVENT_REGEAR_SILVER_CAP_MIN}
                  max={EVENT_REGEAR_SILVER_CAP_MAX}
                  value={regearSilverCap}
                  onChange={(e) => setRegearSilverCap(e.target.value)}
                  placeholder={t('eventRegearSilverCapPlaceholder')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  {t('eventRegearSilverCapHint')}
                </p>
              </div>
              <div>
                <label htmlFor={regearMaxDeathsId} className="text-gray-400 text-xs mb-1 block">
                  {t('eventRegearMaxDeathsLabel')}
                </label>
                <input
                  id={regearMaxDeathsId}
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
                    <label htmlFor={regearVideoRateId} className="text-gray-400 text-xs mb-1 block">
                      {t('eventRegearVideoRateLabel')}
                    </label>
                    <input
                      id={regearVideoRateId}
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
                    <label htmlFor={regearVideoBonusId} className="text-gray-400 text-xs mb-1 block">
                      {t('eventRegearVideoBonusLabel')}
                    </label>
                    <input
                      id={regearVideoBonusId}
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
        </fieldset>
      )}

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('gatherTimeLabel')}</label>
        <FourPartTimeInput parts={parts} onChange={setParts} labels={partLabels} />
        <p className={`text-xs mt-1.5 ${preview ? 'text-amber-300' : 'text-red-400'}`}>
          {preview ? t('previewPrefix', { value: preview }) : t('gatherTimeIncomplete')}
        </p>
      </div>

      <div>
        <label htmlFor={locationId} className="text-gray-400 text-xs mb-1 block">{t('gatherLocationLabel')}</label>
        <input
          id={locationId}
          type="text"
          value={gatherLocation}
          onChange={(e) => setGatherLocation(e.target.value)}
          placeholder={t('gatherLocationPlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label htmlFor={notesId} className="text-gray-400 text-xs mb-1 block">{t('specialNotesLabel')}</label>
        <textarea
          id={notesId}
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder={t('specialNotesPlaceholder')}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>

      {/*
        공지 채널/역할 선택은 편집 단계에서만 노출. 이벤트를 막 만든 직후
        관리자가 기본 채널 대신 원하는 곳으로 바꿀 수 있도록 편집으로 이동
        하면서 선택하게 만드는 흐름.
      */}
      {isEdit && (
        <>
          <div>
            <label htmlFor={channelId} className="text-gray-400 text-xs mb-1 block">{t('notifyChannelLabel')}</label>
            <select
              id={channelId}
              value={notifyChannelId}
              onChange={(e) => setNotifyChannelId(e.target.value)}
              disabled={channels === null && !channelsError}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="">{t('notifyChannelNone')}</option>
              {(channels ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
            {channelsError ? (
              <p className="text-xs text-red-400 mt-1.5">{t('notifyChannelError')}</p>
            ) : channels === null ? (
              <p className="text-xs text-gray-500 mt-1.5">{t('notifyChannelLoading')}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">{t('notifyChannelHint')}</p>
            )}
          </div>

          <div>
            <label htmlFor={roleId} className="text-gray-400 text-xs mb-1 block">{t('notifyRoleLabel')}</label>
            <select
              id={roleId}
              value={notifyRoleId}
              onChange={(e) => setNotifyRoleId(e.target.value)}
              disabled={roles === null && !rolesError}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="">{t('notifyRoleNone')}</option>
              {(roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {rolesError ? (
              <p className="text-xs text-red-400 mt-1.5">{t('notifyRoleError')}</p>
            ) : roles === null ? (
              <p className="text-xs text-gray-500 mt-1.5">{t('notifyRoleLoading')}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">{t('notifyRoleHint')}</p>
            )}
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2.5">
            <input
              type="checkbox"
              checked={notifyEveryone}
              onChange={(e) => setNotifyEveryone(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-500"
            />
            <span className="flex-1 text-sm">
              <span className="text-white font-semibold block">{t('notifyEveryoneLabel')}</span>
              <span className="text-gray-400 text-xs block mt-0.5">{t('notifyEveryoneHint')}</span>
            </span>
          </label>
        </>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/*
        편집 모드에서는 하단 EventEditSaveBar 가 전체 섹션을 한번에 저장하므로
        개별 저장 버튼을 숨긴다. 생성 모드는 이 버튼으로 확인 모달을 띄운다.
      */}
      {!isEdit && (
        <button
          type="button"
          onClick={openConfirm}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
        >
          {loading ? tCommon('saving') : t('createEvent')}
        </button>
      )}

      {/*
        생성 모드에서만 쓰이는 "미리보기 → 저장" 확인 모달. 관리자가
        실수로 생성 버튼을 눌렀을 때 입력값을 한 번 더 보고 확정할 수 있게.
      */}
      {!isEdit && confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('confirmTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={() => {
              if (!loading) setConfirmOpen(false)
            }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
          />
          <div className="relative max-h-[calc(100dvh-3rem)] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-amber-500/30 bg-gray-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-white font-bold">{t('confirmTitle')}</h2>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="text-gray-500 hover:text-white disabled:opacity-40"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-400">{t('confirmHint')}</p>

            <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-3 text-sm space-y-1.5">
              <p>
                <span className="text-gray-500 text-xs">{t('titleLabel')}</span>
                <br />
                <span className="text-white font-semibold">{title.trim()}</span>
              </p>
              <p>
                <span className="text-gray-500 text-xs">{t('gatherTimeLabel')}</span>
                <br />
                <span className="text-amber-300">{preview}</span>
              </p>
              <p>
                <span className="text-gray-500 text-xs">{t('gatherLocationLabel')}</span>
                <br />
                <span className="text-white">{gatherLocation.trim()}</span>
              </p>
              {specialNotes.trim() && (
                <p>
                  <span className="text-gray-500 text-xs">{t('specialNotesLabel')}</span>
                  <br />
                  <span className="text-gray-200 whitespace-pre-wrap">{specialNotes.trim()}</span>
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={commitCreate}
                disabled={loading}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {loading ? tCommon('saving') : tCommon('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
