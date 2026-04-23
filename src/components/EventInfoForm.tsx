'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createEvent, updateEvent } from '@/app/actions/admin'
import { useRegisterSave } from './EventEditSaveRegistry'
import {
  listGuildRoles,
  listGuildChannels,
  type DiscordRoleOption,
  type DiscordChannelOption,
} from '@/app/actions/notifications'
import { defaultGatherParts, parseGatherTime, formatGatherTimeKo, type GatherTimeParts } from '@/lib/gather-time'
import type { Event, EventCategory } from '@/types'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES } from '@/types'

interface Props {
  initialEvent?: Event
}

type PartKey = keyof GatherTimeParts

const PART_BOUNDS: Record<PartKey, { min: number; max: number }> = {
  month:  { min: 1, max: 12 },
  day:    { min: 1, max: 31 },
  hour:   { min: 0, max: 23 },
  minute: { min: 0, max: 59 },
}

export default function EventInfoForm({ initialEvent }: Props) {
  const router = useRouter()
  const t = useTranslations('adminEventForm')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const locationId = useId()
  const notesId = useId()
  const channelId = useId()
  const roleId = useId()
  const isEdit = !!initialEvent
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [parts, setParts] = useState<GatherTimeParts>(() =>
    defaultGatherParts(initialEvent?.gather_at ?? null),
  )
  const [gatherLocation, setGatherLocation] = useState(initialEvent?.gather_location ?? '')
  const [specialNotes, setSpecialNotes] = useState(initialEvent?.special_notes ?? '')
  const [notifyRoleId, setNotifyRoleId] = useState<string>(initialEvent?.notify_role_id ?? '')
  const [notifyChannelId, setNotifyChannelId] = useState<string>(initialEvent?.notify_channel_id ?? '')
  const [category, setCategory] = useState<EventCategory>(initialEvent?.category ?? '전투')
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
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) setConfirmOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [confirmOpen, loading])

  const parsed = parseGatherTime(parts)
  const preview = parsed ? formatGatherTimeKo(parsed) : null

  const partSuffix = (key: PartKey): string => {
    if (key === 'month') return t('partMonth')
    if (key === 'day') return t('partDay')
    if (key === 'hour') return t('partHour')
    return t('partMinute')
  }

  const handlePartChange = (key: PartKey, raw: string) => {
    // Allow empty string while the user is typing — parse validates on save.
    const next = raw === '' ? Number.NaN : Number(raw)
    setParts((prev) => ({ ...prev, [key]: next }))
  }

  // 폼 → 실제 DB 호출에 쓰는 payload 를 한번에 조립. validate 에서 파싱한
  // Date 를 그대로 받아 다시 파싱하는 일 없이 재사용한다.
  // 결과는 { dt } 또는 { error } — error 상태는 호출측에서 별도로 setError 한다.
  const validate = (): { dt: Date } | { error: string } => {
    if (!title.trim()) return { error: t('titleRequired') }
    const dt = parseGatherTime(parts, {
      referenceIso: initialEvent?.gather_at ?? null,
    })
    if (!dt) return { error: t('gatherTimeInvalid') }
    if (!gatherLocation.trim()) return { error: t('gatherLocationRequired') }
    return { dt }
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
    })
    // dt 가 NaN 이면 아예 날짜를 비워 저장. 유효한 date 가 있으면 같이 저장.
    const dtIso = dt ? dt.toISOString() : ''
    const gatherTimeKo = dt ? formatGatherTimeKo(dt) : ''
    return { title: title.trim(), dtIso, gatherTimeKo, location: gatherLocation.trim() }
  }

  // 생성 버튼은 확인 모달을 띄우는 1차 단계. 편집 모드에서는 렌더되지 않는다.
  const openConfirm = () => {
    const v = validate()
    if ('error' in v) {
      setError(v.error)
      return
    }
    setError('')
    setConfirmOpen(true)
  }

  const commitCreate = async () => {
    const v = validate()
    if ('error' in v) {
      setError(v.error)
      setConfirmOpen(false)
      return
    }
    setError('')
    setLoading(true)
    // 생성 단계에서는 공지 대상(역할/채널) 을 보내지 않는다. 생성 후
    // 편집 화면에서 고르는 흐름.
    const result = await createEvent({
      title: title.trim(),
      gather_at: v.dt.toISOString(),
      gather_time: formatGatherTimeKo(v.dt),
      gather_location: gatherLocation.trim(),
      special_notes: specialNotes.trim() || null,
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
  }

  // 편집 모드에서만 상위 저장 바에 자신을 등록. 생성 모드는 기존 모달 흐름.
  // draft 이벤트는 날짜 / 장소가 비어 있어도 저장되어야 하므로 validateDraft 사용.
  // published 이벤트는 strict 검증 유지 — 이미 공개된 값이 비는 건 허용 불가.
  useRegisterSave(
    'event-info',
    t('sectionTitle'),
    async () => {
      if (!initialEvent) return {}
      const isDraft = initialEvent.status === 'draft'
      if (isDraft) {
        const v = validateDraft()
        if ('error' in v) {
          setError(v.error)
          return { error: v.error }
        }
        const result = await updateEvent(initialEvent.id, {
          title: v.title,
          gather_at: v.dtIso,
          gather_time: v.gatherTimeKo,
          gather_location: v.location,
          special_notes: specialNotes.trim() || null,
          notify_role_id: notifyRoleId || null,
          notify_channel_id: notifyChannelId || null,
          category,
        })
        if ('error' in result && result.error) {
          setError(result.error)
          return { error: result.error }
        }
        setError('')
        return {}
      }
      const v = validate()
      if ('error' in v) {
        setError(v.error)
        return { error: v.error }
      }
      const result = await updateEvent(initialEvent.id, {
        title: title.trim(),
        gather_at: v.dt.toISOString(),
        gather_time: formatGatherTimeKo(v.dt),
        gather_location: gatherLocation.trim(),
        special_notes: specialNotes.trim() || null,
        notify_role_id: notifyRoleId || null,
        notify_channel_id: notifyChannelId || null,
        category,
      })
      if ('error' in result && result.error) {
        setError(result.error)
        return { error: result.error }
      }
      setError('')
      return {}
    },
    isEdit,
  )

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
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
        <label className="text-gray-400 text-xs mb-1 block">{t('categoryLabel')}</label>
        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-sm font-semibold">
          {EVENT_CATEGORIES.map((c) => (
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
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('gatherTimeLabel')}</label>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PART_BOUNDS) as PartKey[]).map((key) => {
            const bounds = PART_BOUNDS[key]
            const value = parts[key]
            const suffix = partSuffix(key)
            return (
              <div key={key} className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={bounds.min}
                  max={bounds.max}
                  value={Number.isNaN(value) ? '' : value}
                  onChange={(e) => handlePartChange(key, e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-7 py-2.5 text-base text-white focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label={suffix}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                  {suffix}
                </span>
              </div>
            )
          })}
        </div>
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
          <div className="relative w-full max-w-md bg-gray-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
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
