'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Save } from 'lucide-react'
import { saveBattleEngagementNote } from '@/app/actions/battles'

interface Props {
  engagementId: string
  initialNote: string | null
  labels: {
    title: string
    description: string
    placeholder: string
    save: string
    saving: string
    saved: string
    error: string
  }
}

export default function BattleEngagementNoteEditor({
  engagementId,
  initialNote,
  labels,
}: Props) {
  const router = useRouter()
  const [note, setNote] = useState(initialNote ?? '')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const save = () => {
    setReceipt(null)
    startTransition(async () => {
      const result = await saveBattleEngagementNote({ engagementId, note })
      if (!result.ok) {
        setReceipt(result.error ?? labels.error)
        return
      }
      setReceipt(labels.saved)
      router.refresh()
    })
  }

  return (
    <section className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
      <div className="flex items-start gap-2">
        <FileText size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-sky-100">{labels.title}</h2>
          <p className="mt-0.5 text-[11px] text-sky-100/60">{labels.description}</p>
        </div>
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={labels.placeholder}
        className="mt-3 w-full resize-y rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-sky-400 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">{note.length}/1000</span>
        <div className="flex items-center gap-2">
          {receipt && (
            <span
              className={
                receipt === labels.saved
                  ? 'text-xs text-emerald-300'
                  : 'text-xs text-red-300'
              }
              role="status"
            >
              {receipt}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={isPending || note === (initialNote ?? '')}
            className="inline-flex min-h-10 items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={13} />
            {isPending ? labels.saving : labels.save}
          </button>
        </div>
      </div>
    </section>
  )
}
