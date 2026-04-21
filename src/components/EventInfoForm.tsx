'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createEvent, updateEvent } from '@/app/actions/admin'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'
import { defaultGatherParts, parseGatherTime, formatGatherTimeKo, type GatherTimeParts } from '@/lib/gather-time'
import type { Event } from '@/types'

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
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [parts, setParts] = useState<GatherTimeParts>(() =>
    defaultGatherParts(initialEvent?.gather_at ?? null),
  )
  const [gatherLocation, setGatherLocation] = useState(initialEvent?.gather_location ?? '')
  const [specialNotes, setSpecialNotes] = useState(initialEvent?.special_notes ?? '')
  const [notifyRoleId, setNotifyRoleId] = useState<string>(initialEvent?.notify_role_id ?? '')
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [rolesError, setRolesError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // 역할 목록은 봇 토큰으로만 조회 가능 — 서버 액션이 Discord API 로 1회 fetch.
    void (async () => {
      const res = await listGuildRoles()
      if (res.error) {
        setRolesError(true)
        return
      }
      setRoles(res.roles)
    })()
  }, [])

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

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t('titleRequired'))
      return
    }
    const dt = parseGatherTime(parts, {
      referenceIso: initialEvent?.gather_at ?? null,
    })
    if (!dt) {
      setError(t('gatherTimeInvalid'))
      return
    }
    if (!gatherLocation.trim()) {
      setError(t('gatherLocationRequired'))
      return
    }

    setLoading(true)
    setError('')

    const payload = {
      title: title.trim(),
      gather_at: dt.toISOString(),
      gather_time: formatGatherTimeKo(dt),
      gather_location: gatherLocation.trim(),
      special_notes: specialNotes.trim() || null,
      notify_role_id: notifyRoleId || null,
    }

    if (initialEvent) {
      const result = await updateEvent(initialEvent.id, payload)
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    } else {
      const result = await createEvent(payload)
      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('id' in result) {
        router.push(`/admin/dashboard/events/${result.id}`)
      }
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <h2 className="font-bold text-white">{t('sectionTitle')}</h2>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('titleLabel')}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
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
        <label className="text-gray-400 text-xs mb-1 block">{t('gatherLocationLabel')}</label>
        <input
          type="text"
          value={gatherLocation}
          onChange={(e) => setGatherLocation(e.target.value)}
          placeholder={t('gatherLocationPlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('specialNotesLabel')}</label>
        <textarea
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          placeholder={t('specialNotesPlaceholder')}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('notifyRoleLabel')}</label>
        <select
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading}
        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
      >
        {loading ? tCommon('saving') : initialEvent ? tCommon('save') : t('createEvent')}
      </button>
    </div>
  )
}
