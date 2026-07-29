'use client'

import { useState, useTransition } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import {
  setMyActivityVisibility,
  setMyLeaderboardVisibility,
  type SetMyActivityVisibilityResult,
} from '@/app/actions/member-activity-visibility'
import { useConfirm } from './ConfirmDialog'

interface Labels {
  publicBadge: string
  privateBadge: string
  enable: string
  disable: string
  copy: string
  copied: string
  confirmEnable: string
  leaderboardLabel: string
  leaderboardPublic: string
  leaderboardPrivate: string
  leaderboardEnable: string
  leaderboardDisable: string
  leaderboardConfirmEnable: string
  error: string
}

interface Props {
  guildId: string
  initialEnabled: boolean
  initialLeaderboardEnabled: boolean
  publicUrl: string
  labels: Labels
}

export default function ActivityRecordVisibilityControl({
  guildId,
  initialEnabled,
  initialLeaderboardEnabled,
  publicUrl,
  labels,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(
    initialLeaderboardEnabled,
  )
  const [url, setUrl] = useState(publicUrl)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()

  const toggle = async () => {
    const next = !enabled
    if (next) {
      const ok = await askConfirm(labels.confirmEnable)
      if (!ok) return
    }

    setError(null)
    startTransition(async () => {
      const result: SetMyActivityVisibilityResult = await setMyActivityVisibility(guildId, next)
      if (!result.ok) {
        setError(labels.error)
        return
      }
      setEnabled(Boolean(result.enabled))
      if (!result.enabled) setLeaderboardEnabled(false)
      if (result.publicUrl) setUrl(result.publicUrl)
    })
  }

  const toggleLeaderboard = async () => {
    if (!enabled) return
    const next = !leaderboardEnabled
    if (next) {
      const ok = await askConfirm(labels.leaderboardConfirmEnable)
      if (!ok) return
    }
    setError(null)
    startTransition(async () => {
      const result = await setMyLeaderboardVisibility(guildId, next)
      if (!result.ok) {
        setError(labels.error)
        return
      }
      setLeaderboardEnabled(Boolean(result.enabled))
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setError(labels.error)
    }
  }

  return (
    <div className="flex flex-col items-start sm:items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            enabled
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-gray-700 bg-gray-950/50 text-gray-400'
          }`}
        >
          {enabled ? <Eye size={11} /> : <EyeOff size={11} />}
          {enabled ? labels.publicBadge : labels.privateBadge}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:border-amber-500/40 hover:text-amber-200 disabled:opacity-50"
        >
          {enabled ? labels.disable : labels.enable}
        </button>
        {enabled && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:border-amber-500/40 hover:text-amber-200"
          >
            <Copy size={11} />
            {copied ? labels.copied : labels.copy}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold text-gray-500">
          {labels.leaderboardLabel}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            enabled && leaderboardEnabled
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              : 'border-gray-700 bg-gray-950/50 text-gray-400'
          }`}
        >
          {enabled && leaderboardEnabled ? <Eye size={11} /> : <EyeOff size={11} />}
          {enabled && leaderboardEnabled
            ? labels.leaderboardPublic
            : labels.leaderboardPrivate}
        </span>
        <button
          type="button"
          onClick={toggleLeaderboard}
          disabled={pending || !enabled}
          className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {leaderboardEnabled
            ? labels.leaderboardDisable
            : labels.leaderboardEnable}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  )
}
