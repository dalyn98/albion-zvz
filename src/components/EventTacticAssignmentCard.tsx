'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpen, ExternalLink, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import {
  assignEventTactic,
  clearEventTactic,
} from '@/app/actions/event-operations'

interface TacticOption {
  id: string
  title: string
  summary: string
  stepCount: number
  updatedAt: string
}

interface SnapshotSummary {
  sourceBoardId: string
  sourceBoardUpdatedAt: string
  title: string
  capturedAtLabel: string
}

interface Props {
  eventId: string
  boards: readonly TacticOption[]
  snapshot: SnapshotSummary | null
  battleStarted: boolean
}

export default function EventTacticAssignmentCard({
  eventId,
  boards,
  snapshot,
  battleStarted,
}: Props) {
  const t = useTranslations('eventOperations')
  const router = useRouter()
  const initialBoardId = boards.some((board) => board.id === snapshot?.sourceBoardId)
    ? snapshot!.sourceBoardId
    : (boards[0]?.id ?? '')
  const [boardId, setBoardId] = useState(initialBoardId)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()
  const selectedBoard = boards.find((board) => board.id === boardId)
  const sourceBoard = boards.find((board) => board.id === snapshot?.sourceBoardId)
  const hasNewerSource = !!snapshot && !!sourceBoard &&
    new Date(sourceBoard.updatedAt).getTime() > new Date(snapshot.sourceBoardUpdatedAt).getTime()

  function assign() {
    if (!boardId) return
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await assignEventTactic({ eventId, boardId })
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t(snapshot ? 'tacticRefreshed' : 'tacticAssigned'))
      router.refresh()
    })
  }

  function clear() {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await clearEventTactic(eventId)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('tacticCleared'))
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <BookOpen size={16} className="text-sky-300" />
            {t('tacticTitle')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-400">
            {t('tacticDescription')}
          </p>
        </div>
        <Link
          href="/admin/dashboard/tactics"
          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200"
        >
          {t('manageTactics')}
          <ExternalLink size={12} />
        </Link>
      </div>

      {snapshot ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
                <ShieldCheck size={14} />
                <span className="truncate">{snapshot.title}</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {t('capturedAt', { date: snapshot.capturedAtLabel })}
              </p>
              {hasNewerSource && (
                <p className="mt-1 text-xs font-semibold text-amber-300">
                  {t('tacticUpdateAvailable')}
                </p>
              )}
            </div>
            <Link
              href={`/events/${eventId}/tactic`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              {t('viewSnapshot')}
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-700 px-3 py-3 text-xs text-gray-400">
          {t('tacticEmpty')}
        </p>
      )}

      {battleStarted ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200">
          {t('tacticLockedDescription')}
        </p>
      ) : boards.length === 0 ? (
        <p className="rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-xs text-gray-400">
          {t('noPublishedTactics')}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-300">{t('tacticSelectLabel')}</span>
            <select
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
              disabled={pending}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500 disabled:opacity-60"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {t('tacticOption', { title: board.title, count: board.stepCount })}
                </option>
              ))}
            </select>
            {selectedBoard?.summary && (
              <p className="line-clamp-2 text-xs text-gray-500">{selectedBoard.summary}</p>
            )}
          </label>
          <button
            type="button"
            onClick={assign}
            disabled={pending || !boardId}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-gray-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {snapshot ? t('replaceSnapshot') : t('assignSnapshot')}
          </button>
        </div>
      )}

      {!battleStarted && snapshot && (
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-300 disabled:opacity-50"
        >
          <Trash2 size={13} />
          {t('clearSnapshot')}
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {success}
        </p>
      )}
    </section>
  )
}
