'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TacticBoardDocument } from '@/lib/tactics/queries'
import {
  TACTIC_ROLE_FOCUS_VALUES,
  type TacticGuidance,
  type TacticRoleFocus,
} from '@/lib/tactics/schema'
import TacticCanvas from './TacticCanvas'

interface TacticViewerProps {
  document: TacticBoardDocument
  showAdminLink?: boolean
}

export default function TacticViewer({ document, showAdminLink = false }: TacticViewerProps) {
  const t = useTranslations('tactics')
  const [activeIndex, setActiveIndex] = useState(0)
  const [focus, setFocus] = useState<TacticRoleFocus>('all')
  const [playing, setPlaying] = useState(false)
  const steps = document.steps
  const activeStep = steps[activeIndex] ?? steps[0]

  useEffect(() => {
    if (!playing || !activeStep) return
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, activeStep.durationSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [playing, activeStep, steps.length])

  const roleCallout = useMemo(() => {
    if (!activeStep || focus === 'all') return ''
    return activeStep.roleCallouts[focus] ?? ''
  }, [activeStep, focus])

  if (!activeStep) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-10 text-center text-sm text-gray-400">
        {t('emptySteps')}
      </div>
    )
  }

  const guidance = activeStep.guidance

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            {t(`terrain.${document.board.terrainType}`)}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">
            {document.board.title}
          </h1>
          {document.board.summary && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-400">
              {document.board.summary}
            </p>
          )}
        </div>
        {showAdminLink && (
          <a
            href={`/admin/dashboard/tactics/${document.board.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-amber-400 hover:text-white"
          >
            {t('openEditor')}
          </a>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-1">
        {TACTIC_ROLE_FOCUS_VALUES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setFocus(role)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              focus === role
                ? 'bg-amber-500 text-gray-950'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {t(`role.${role}`)}
          </button>
        ))}
      </div>

      <TacticCanvas state={activeStep.boardState} focus={focus} />

      <section className="rounded-xl border border-gray-800 bg-gray-950/80 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-gray-500">
                {t('stepCounter', { current: activeIndex + 1, total: steps.length })}
              </p>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                {t(`phase.${guidance.phase}`)}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">{activeStep.title}</h2>
            {activeStep.callout && (
              <p className="mt-2 text-sm leading-relaxed text-gray-300">{activeStep.callout}</p>
            )}
            {roleCallout && (
              <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {roleCallout}
              </p>
            )}
            <GuidancePanel guidance={guidance} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveIndex((v) => Math.max(0, v - 1))}
              disabled={activeIndex === 0}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('previousStep')}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-gray-950 hover:bg-amber-400"
              aria-label={playing ? t('pause') : t('play')}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((v) => Math.min(steps.length - 1, v + 1))}
              disabled={activeIndex >= steps.length - 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('nextStep')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function GuidancePanel({ guidance }: { guidance: TacticGuidance }) {
  const t = useTranslations('tactics')
  const hasSummary = !!(guidance.intent || guidance.trigger || guidance.callerSignal)
  const hasLists =
    guidance.dangerSigns.length > 0 ||
    guidance.commonMistakes.length > 0 ||
    guidance.decisionBranches.length > 0
  if (!hasSummary && !hasLists) return null

  return (
    <div className="mt-4 space-y-3 border-t border-gray-800 pt-4">
      {hasSummary && (
        <div className="grid gap-3 lg:grid-cols-3">
          {guidance.intent && (
            <GuidanceTextBlock label={t('intentLabel')} value={guidance.intent} />
          )}
          {guidance.trigger && (
            <GuidanceTextBlock label={t('triggerLabel')} value={guidance.trigger} />
          )}
          {guidance.callerSignal && (
            <GuidanceTextBlock label={t('callerSignalLabel')} value={guidance.callerSignal} />
          )}
        </div>
      )}

      {(guidance.dangerSigns.length > 0 || guidance.commonMistakes.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <GuidanceList label={t('dangerSignsLabel')} items={guidance.dangerSigns} />
          <GuidanceList label={t('commonMistakesLabel')} items={guidance.commonMistakes} />
        </div>
      )}

      {guidance.decisionBranches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500">{t('decisionBranchesLabel')}</p>
          <div className="grid gap-2">
            {guidance.decisionBranches.map((branch, index) => (
              <div key={index} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
                <p className="text-sm font-semibold text-gray-100">{branch.condition}</p>
                <p className="mt-1 text-sm text-emerald-200">{branch.action}</p>
                {branch.fallback && (
                  <p className="mt-1 text-xs text-gray-400">{branch.fallback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GuidanceTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-300">{value}</p>
    </div>
  )
}

function GuidanceList({ label, items }: { label: string; items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <ul className="mt-1 space-y-1 text-sm leading-relaxed text-gray-300">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
