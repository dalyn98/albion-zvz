'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { triggerManualSync, type ManualSyncResult } from './actions'

export default function ManualSyncButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ManualSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setResult(null)
    setError(null)
    startTransition(async () => {
      try {
        const res = await triggerManualSync()
        setResult(res)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const StatusIcon = result?.ok ? Check : AlertTriangle

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
        {pending ? '동기화 중… (최대 2분)' : '지금 동기화'}
      </button>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          실패: {error}
        </div>
      )}

      {result && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border flex items-start gap-2 ${
            result.ok
              ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30'
              : 'text-amber-200 bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <StatusIcon size={14} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div>
              {result.ok ? '동기화 완료' : '일부 실패'} ·{' '}
              {(result.durationMs / 1000).toFixed(1)}s
            </div>
            <div className="text-gray-400 font-mono">
              battle-tracker {result.battleTracker.status} · killboard-sync{' '}
              {result.killboardSync.status}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
