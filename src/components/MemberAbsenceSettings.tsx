'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  createMyMemberAbsence,
  deleteMyMemberAbsence,
} from '@/app/actions/member-operations'
import type { MemberAbsenceRecord } from '@/lib/member-operations-server'

interface Props {
  absences: readonly MemberAbsenceRecord[]
  todayIso: string
}

export default function MemberAbsenceSettings({ absences, todayIso }: Props) {
  const t = useTranslations('memberOperations')
  const router = useRouter()
  const [startsOn, setStartsOn] = useState(todayIso)
  const [endsOn, setEndsOn] = useState(todayIso)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  function create() {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await createMyMemberAbsence({ startsOn, endsOn, reason })
      if (result.error) {
        setError(result.error)
        return
      }
      setReason('')
      setSuccess(t('absenceSaved'))
      router.refresh()
    })
  }

  function remove(absenceId: string) {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await deleteMyMemberAbsence(absenceId)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('absenceDeleted'))
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
          <CalendarOff size={15} className="text-violet-300" />
          {t('absenceTitle')}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          {t('absenceDescription')}
        </p>
      </div>

      {absences.length > 0 && (
        <ul className="space-y-2">
          {absences.map((absence) => (
            <li
              key={absence.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-violet-200">
                  {t('absenceRange', {
                    from: absence.startsOn,
                    to: absence.endsOn,
                  })}
                </p>
                {absence.reason && (
                  <p className="mt-1 break-words text-xs text-gray-400">{absence.reason}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(absence.id)}
                disabled={pending}
                aria-label={t('absenceDelete')}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-300">{t('absenceStartsOn')}</span>
          <input
            type="date"
            value={startsOn}
            min={todayIso}
            onChange={(event) => {
              const next = event.target.value
              setStartsOn(next)
              if (endsOn < next) setEndsOn(next)
            }}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-300">{t('absenceEndsOn')}</span>
          <input
            type="date"
            value={endsOn}
            min={startsOn || todayIso}
            onChange={(event) => setEndsOn(event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-gray-300">
          {t('absenceReason')}
        </span>
        <input
          type="text"
          value={reason}
          maxLength={240}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('absenceReasonPlaceholder')}
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        />
      </label>
      <button
        type="button"
        onClick={create}
        disabled={pending || !startsOn || !endsOn}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {t('absenceAdd')}
      </button>

      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {success && <p role="status" className="text-xs text-emerald-300">{success}</p>}
    </section>
  )
}
