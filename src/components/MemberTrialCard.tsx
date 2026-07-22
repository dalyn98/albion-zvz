'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarOff, Loader2, Save, UserRoundCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { saveMemberTrial } from '@/app/actions/member-operations'
import type {
  MemberAbsenceRecord,
  MemberTrialProfile,
} from '@/lib/member-operations-server'
import type { MemberTrialStatus } from '@/lib/member-operations'

interface Props {
  discordId: string
  profile: MemberTrialProfile | null
  absences: readonly MemberAbsenceRecord[]
  canManage: boolean
  todayIso: string
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function MemberTrialCard({
  discordId,
  profile,
  absences,
  canManage,
  todayIso,
}: Props) {
  const t = useTranslations('memberOperations')
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<MemberTrialStatus>(profile?.status ?? 'trial')
  const [startedOn, setStartedOn] = useState(profile?.startedOn ?? todayIso)
  const [reviewDueOn, setReviewDueOn] = useState(
    profile?.reviewDueOn ?? addDays(todayIso, 14),
  )
  const [notes, setNotes] = useState(profile?.notes ?? '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()
  const overdue = profile?.status === 'trial' && profile.reviewDueOn < todayIso

  function resetDraft() {
    setStatus(profile?.status ?? 'trial')
    setStartedOn(profile?.startedOn ?? todayIso)
    setReviewDueOn(profile?.reviewDueOn ?? addDays(todayIso, 14))
    setNotes(profile?.notes ?? '')
  }

  function startEditing() {
    resetDraft()
    setError('')
    setSuccess('')
    setEditing(true)
  }

  function cancelEditing() {
    resetDraft()
    setError('')
    setEditing(false)
  }

  function save() {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await saveMemberTrial({
        discordId,
        status,
        startedOn,
        reviewDueOn,
        notes,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('trialSaved'))
      setEditing(false)
      router.refresh()
    })
  }

  if (!profile && !canManage && absences.length === 0) return null

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <UserRoundCheck size={15} className="text-sky-300" />
            {t('trialTitle')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{t('trialDescription')}</p>
        </div>
        {canManage && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-lg border border-sky-500/30 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/10"
          >
            {profile ? t('trialEdit') : t('trialStart')}
          </button>
        )}
      </div>

      {profile && !editing && (
        <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${
              profile.status === 'trial'
                ? overdue
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-sky-500/15 text-sky-200'
                : profile.status === 'accepted'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-gray-700 text-gray-300'
            }`}>
              {t(`trialStatus.${profile.status}`)}
            </span>
            <span className="font-mono text-xs text-gray-400">
              {t('trialRange', { from: profile.startedOn, to: profile.reviewDueOn })}
            </span>
            {overdue && <span className="text-xs font-bold text-red-300">{t('trialOverdue')}</span>}
          </div>
          {canManage && profile.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-gray-400">
              {profile.notes}
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-300">{t('trialStatusLabel')}</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as MemberTrialStatus)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            >
              <option value="trial">{t('trialStatus.trial')}</option>
              <option value="accepted">{t('trialStatus.accepted')}</option>
              <option value="rejected">{t('trialStatus.rejected')}</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-300">{t('trialStartedOn')}</span>
              <input
                type="date"
                value={startedOn}
                onChange={(event) => setStartedOn(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-300">{t('trialReviewDueOn')}</span>
              <input
                type="date"
                value={reviewDueOn}
                min={startedOn}
                onChange={(event) => setReviewDueOn(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-300">{t('trialNotes')}</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('trialNotesPlaceholder')}
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !startedOn || !reviewDueOn}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-gray-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('trialSave')}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={pending}
              className="min-h-10 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {absences.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-violet-200">
            <CalendarOff size={13} />
            {t('memberAbsencesTitle')}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {absences.map((absence) => (
              <li key={absence.id} className="rounded-lg border border-violet-500/15 bg-violet-500/[0.05] px-3 py-2 text-xs text-gray-300">
                <span className="font-mono font-bold text-violet-200">
                  {t('absenceRange', { from: absence.startsOn, to: absence.endsOn })}
                </span>
                {absence.reason && <span className="ml-2 text-gray-500">· {absence.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {success && <p role="status" className="text-xs text-emerald-300">{success}</p>}
    </section>
  )
}
