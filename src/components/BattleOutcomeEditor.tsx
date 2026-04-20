'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, RotateCcw, Loader2, Trophy, ShieldAlert } from 'lucide-react'
import { saveEventBattles, resetEventOutcome } from '@/app/actions/admin'
import type { EventBattle, EventOutcome } from '@/types'

interface Props {
  eventId: string
  initialBattles: EventBattle[]
  currentOutcome: EventOutcome | null
}

interface BattleDraft {
  opponent_guild: string
  outcome: EventOutcome
}

export default function BattleOutcomeEditor({ eventId, initialBattles, currentOutcome }: Props) {
  const t = useTranslations('adminBattleOutcome')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [battles, setBattles] = useState<BattleDraft[]>(() =>
    initialBattles.length > 0
      ? initialBattles.map((b) => ({ opponent_guild: b.opponent_guild, outcome: b.outcome }))
      : [{ opponent_guild: '', outcome: 'win' }],
  )

  const preview = useMemo<EventOutcome | 'tie'>(() => {
    const wins = battles.filter((b) => b.outcome === 'win').length
    const losses = battles.length - wins
    if (wins > losses) return 'win'
    if (losses > wins) return 'loss'
    return 'tie'
  }, [battles])

  const addBattle = () =>
    setBattles((prev) => [...prev, { opponent_guild: '', outcome: 'win' }])

  const removeBattle = (index: number) =>
    setBattles((prev) => prev.filter((_, i) => i !== index))

  const updateBattle = (index: number, patch: Partial<BattleDraft>) =>
    setBattles((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  const save = () => {
    setError('')
    const payload = battles.map((b, i) => ({
      battle_number: i + 1,
      opponent_guild: b.opponent_guild,
      outcome: b.outcome,
    }))
    startTransition(async () => {
      const result = await saveEventBattles(eventId, payload)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const reset = () => {
    if (!confirm(t('resetConfirm'))) return
    setError('')
    startTransition(async () => {
      const result = await resetEventOutcome(eventId)
      if (result.error) setError(result.error)
      else {
        setBattles([{ opponent_guild: '', outcome: 'win' }])
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-white flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" />
            {t('sectionTitle')}
          </h2>
          <p className="text-gray-400 text-xs mt-1">{t('description')}</p>
        </div>
        {currentOutcome && <OutcomeBadge outcome={currentOutcome} />}
      </div>

      <div className="space-y-2">
        {battles.map((battle, index) => (
          <div
            key={index}
            className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-lg p-2"
          >
            <span className="text-gray-500 text-xs w-8 text-center flex-shrink-0">
              #{index + 1}
            </span>
            <input
              type="text"
              value={battle.opponent_guild}
              onChange={(e) => updateBattle(index, { opponent_guild: e.target.value })}
              placeholder={t('opponentPlaceholder')}
              maxLength={100}
              className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <div className="flex rounded overflow-hidden border border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => updateBattle(index, { outcome: 'win' })}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  battle.outcome === 'win'
                    ? 'bg-emerald-500/30 text-emerald-200'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t('win')}
              </button>
              <button
                type="button"
                onClick={() => updateBattle(index, { outcome: 'loss' })}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  battle.outcome === 'loss'
                    ? 'bg-rose-500/30 text-rose-200'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t('loss')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeBattle(index)}
              disabled={battles.length === 1}
              className="p-2 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 flex-shrink-0"
              aria-label={tCommon('delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addBattle}
        className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200"
      >
        <Plus size={14} />
        {t('addBattle')}
      </button>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-800">
        <div className="text-xs text-gray-400">
          {t('previewLabel')}{' '}
          {preview === 'tie' ? (
            <span className="text-gray-300 font-semibold">{t('tie')}</span>
          ) : (
            <OutcomeInlineBadge outcome={preview} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {initialBattles.length > 0 && (
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 disabled:opacity-50 px-3 py-2 rounded border border-gray-700 hover:border-red-500/40"
            >
              <RotateCcw size={12} />
              {t('reset')}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded text-sm"
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {pending ? tCommon('saving') : tCommon('save')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: EventOutcome }) {
  const t = useTranslations('adminBattleOutcome')
  if (outcome === 'win') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
        <Trophy size={12} />
        {t('win')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold px-3 py-1 rounded-full">
      <ShieldAlert size={12} />
      {t('loss')}
    </span>
  )
}

function OutcomeInlineBadge({ outcome }: { outcome: EventOutcome }) {
  const t = useTranslations('adminBattleOutcome')
  const classes =
    outcome === 'win'
      ? 'text-emerald-300 font-semibold'
      : 'text-rose-300 font-semibold'
  return <span className={classes}>{outcome === 'win' ? t('win') : t('loss')}</span>
}
