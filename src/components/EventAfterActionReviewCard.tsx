'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ClipboardPenLine, Loader2, Save } from 'lucide-react'
import { saveEventAfterActionReview } from '@/app/actions/event-operations'

interface ReviewContent {
  summary: string
  wins: readonly string[]
  issues: readonly string[]
  actionItems: readonly string[]
  updatedAtLabel?: string
}

interface Props {
  eventId: string
  review: ReviewContent | null
  canEdit: boolean
}

function ReviewList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed text-gray-300">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function EventAfterActionReviewCard({ eventId, review, canEdit }: Props) {
  const t = useTranslations('eventOperations')
  const router = useRouter()
  const [summary, setSummary] = useState(review?.summary ?? '')
  const [wins, setWins] = useState(review?.wins.join('\n') ?? '')
  const [issues, setIssues] = useState(review?.issues.join('\n') ?? '')
  const [actionItems, setActionItems] = useState(review?.actionItems.join('\n') ?? '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  function save() {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const result = await saveEventAfterActionReview({
        eventId,
        summary,
        wins,
        issues,
        actionItems,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('aarSaved'))
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <ClipboardPenLine size={15} className="text-sky-300" />
            {t('aarTitle')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{t('aarDescription')}</p>
        </div>
        {review?.updatedAtLabel && (
          <span className="text-xs text-gray-500">
            {t('aarUpdatedAt', { date: review.updatedAtLabel })}
          </span>
        )}
      </div>

      {canEdit ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-300">{t('aarSummaryLabel')}</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t('aarSummaryPlaceholder')}
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>
          <div className="grid gap-3 lg:grid-cols-3">
            <ReviewTextarea
              label={t('aarWinsLabel')}
              placeholder={t('aarWinsPlaceholder')}
              value={wins}
              onChange={setWins}
            />
            <ReviewTextarea
              label={t('aarIssuesLabel')}
              placeholder={t('aarIssuesPlaceholder')}
              value={issues}
              onChange={setIssues}
            />
            <ReviewTextarea
              label={t('aarActionsLabel')}
              placeholder={t('aarActionsPlaceholder')}
              value={actionItems}
              onChange={setActionItems}
            />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-gray-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {pending ? t('aarSaving') : t('aarSave')}
          </button>
        </div>
      ) : review ? (
        <div className="space-y-4">
          {review.summary && <p className="text-sm leading-relaxed text-gray-200">{review.summary}</p>}
          <div className="grid gap-4 lg:grid-cols-3">
            {review.wins.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-300">
                  {t('aarWinsLabel')}
                </h3>
                <ReviewList items={review.wins} />
              </div>
            )}
            {review.issues.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-300">
                  {t('aarIssuesLabel')}
                </h3>
                <ReviewList items={review.issues} />
              </div>
            )}
            {review.actionItems.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-300">
                  {t('aarActionsLabel')}
                </h3>
                <ReviewList items={review.actionItems} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-700 px-3 py-3 text-sm text-gray-500">
          {t('aarEmpty')}
        </p>
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

function ReviewTextarea({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={2000}
        rows={5}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
      />
    </label>
  )
}
