'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { createTacticBoard } from '@/app/actions/tactics'
import { TACTIC_TERRAIN_VALUES, type TacticTerrain } from '@/lib/tactics/schema'

export default function TacticCreateForm() {
  const t = useTranslations('tactics')
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [terrainType, setTerrainType] = useState<TacticTerrain>('open-field')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError('')
    startTransition(async () => {
      const result = await createTacticBoard({ title, summary, terrainType })
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.id) router.push(`/admin/dashboard/tactics/${result.id}`)
    })
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto] lg:items-end">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-400">{t('titleLabel')}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isPending) submit()
            }}
            placeholder={t('titlePlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            maxLength={80}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-400">{t('summaryLabel')}</span>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={t('summaryPlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            maxLength={300}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-400">{t('terrainLabel')}</span>
          <select
            value={terrainType}
            onChange={(event) => setTerrainType(event.target.value as TacticTerrain)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
          >
            {TACTIC_TERRAIN_VALUES.map((terrain) => (
              <option key={terrain} value={terrain}>
                {t(`terrain.${terrain}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || title.trim().length === 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} />
          {isPending ? t('creating') : t('create')}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </section>
  )
}
