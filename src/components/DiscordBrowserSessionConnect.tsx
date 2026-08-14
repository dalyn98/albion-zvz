'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import DiscordIcon from '@/components/DiscordIcon'
import { cx, pressScaleClass } from '@/components/ui-patterns'

interface Props {
  returnTo: string
  labels: {
    start: string
    description: string
    codeLabel: string
    copyCode: string
    copied: string
    openDiscord: string
    waiting: string
    expired: string
    failed: string
    cancel: string
  }
}

interface Attempt {
  attemptId: string
  approvalCode: string
  discordUrl: string
}

type Phase = 'idle' | 'starting' | 'waiting' | 'expired' | 'failed'

export default function DiscordBrowserSessionConnect({ returnTo, labels }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [copied, setCopied] = useState(false)
  const pollInFlight = useRef(false)

  const reset = useCallback(() => {
    setAttempt(null)
    setCopied(false)
    setPhase('idle')
  }, [])

  const start = useCallback(async () => {
    setPhase('starting')
    setAttempt(null)
    setCopied(false)
    try {
      const response = await fetch('/api/auth/discord/device/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      })
      const body = await response.json() as Partial<Attempt> & { ok?: boolean }
      if (
        !response.ok ||
        body.ok !== true ||
        typeof body.attemptId !== 'string' ||
        typeof body.approvalCode !== 'string' ||
        typeof body.discordUrl !== 'string'
      ) {
        setPhase('failed')
        return
      }
      setAttempt({
        attemptId: body.attemptId,
        approvalCode: body.approvalCode,
        discordUrl: body.discordUrl,
      })
      setPhase('waiting')
    } catch {
      setPhase('failed')
    }
  }, [returnTo])

  useEffect(() => {
    if (phase !== 'waiting' || !attempt) return
    let active = true

    const poll = async () => {
      if (!active || pollInFlight.current) return
      pollInFlight.current = true
      try {
        const response = await fetch(
          `/api/auth/discord/device/status?id=${encodeURIComponent(attempt.attemptId)}`,
          { credentials: 'same-origin', cache: 'no-store' },
        )
        const body = await response.json() as {
          status?: string
          redirectTo?: string
        }
        if (!active) return
        if (
          response.ok &&
          body.status === 'complete' &&
          typeof body.redirectTo === 'string'
        ) {
          window.location.assign(body.redirectTo)
          return
        }
        if (body.status === 'expired' || body.status === 'invalid') {
          setPhase('expired')
        }
      } catch {
        // A transient mobile network failure must not burn the five-minute code.
      } finally {
        pollInFlight.current = false
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), 2_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [attempt, phase])

  const copyCode = useCallback(async () => {
    if (!attempt) return
    try {
      await navigator.clipboard.writeText(attempt.approvalCode)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [attempt])

  if (phase === 'idle' || phase === 'starting') {
    return (
      <button
        type="button"
        disabled={phase === 'starting'}
        onClick={() => void start()}
        className={cx(
          'group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] py-3.5 font-semibold text-[#fff] shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#4752c4] disabled:cursor-wait disabled:opacity-70',
          pressScaleClass,
        )}
      >
        <DiscordIcon />
        <span>{labels.start}</span>
      </button>
    )
  }

  if (phase === 'failed' || phase === 'expired') {
    return (
      <div
        aria-live="polite"
        className="space-y-3 rounded-xl border border-red-400/25 bg-black/35 p-4"
      >
        <p className="text-sm text-red-200">
          {phase === 'expired' ? labels.expired : labels.failed}
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className={cx(
            'inline-flex w-full items-center justify-center rounded-lg bg-[#5865F2] py-2.5 text-sm font-semibold text-[#fff] hover:bg-[#4752c4]',
            pressScaleClass,
          )}
        >
          {labels.start}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#7289da]/40 bg-black/40 p-4 text-left">
      <p className="text-sm leading-relaxed text-gray-100">{labels.description}</p>
      <div className="rounded-lg border border-white/15 bg-black/35 p-3 text-center">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
          {labels.codeLabel}
        </p>
        <code className="text-2xl font-bold tracking-[0.18em] text-white">
          {attempt?.approvalCode}
        </code>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copyCode()}
          className={cx(
            'rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/15',
            pressScaleClass,
          )}
        >
          {copied ? labels.copied : labels.copyCode}
        </button>
        <a
          href={attempt?.discordUrl}
          target="_blank"
          rel="noreferrer"
          className={cx(
            'inline-flex items-center justify-center rounded-lg bg-[#5865F2] px-3 py-2.5 text-xs font-semibold text-[#fff] hover:bg-[#4752c4]',
            pressScaleClass,
          )}
        >
          {labels.openDiscord}
        </a>
      </div>
      <p aria-live="polite" className="text-center text-xs text-[#c7d0ff]">
        {labels.waiting}
      </p>
      <button
        type="button"
        onClick={reset}
        className="block w-full text-center text-xs text-gray-400 underline underline-offset-4 hover:text-white"
      >
        {labels.cancel}
      </button>
    </div>
  )
}
