'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarCheck,
  Check,
  ChevronRight,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { cx, pressScaleClass, prettyTextClass } from '@/components/ui-patterns'
import {
  DEMO_JOURNEY_STAGES,
  INITIAL_DEMO_JOURNEY_STAGE,
  advanceDemoJourney,
  getDemoJourneyStageIndex,
  isDemoJourneyComplete,
  type DemoJourneyStage,
} from '@/lib/demo-journey'
import { useDemoToast } from './DemoFeedbackProvider'

const STAGE_ACTORS: Record<DemoJourneyStage, 'member' | 'operator' | 'crafter'> = {
  event_open: 'member',
  signed_up: 'operator',
  attendance_confirmed: 'member',
  regear_requested: 'operator',
  regear_approved: 'crafter',
  gear_delivered: 'member',
  completed: 'member',
}

const STAGE_ICONS = [CalendarCheck, UserCheck, ShieldCheck, PackageCheck] as const

export default function DemoInteractiveJourney() {
  const t = useTranslations('demo.journey')
  const { showToast } = useDemoToast()
  const [stage, setStage] = useState<DemoJourneyStage>(INITIAL_DEMO_JOURNEY_STAGE)
  const stageIndex = getDemoJourneyStageIndex(stage)
  const completed = isDemoJourneyComplete(stage)
  const progress = Math.round((stageIndex / (DEMO_JOURNEY_STAGES.length - 1)) * 100)

  const timeline = [
    { threshold: 1, title: t('timeline.signup'), icon: STAGE_ICONS[0] },
    { threshold: 2, title: t('timeline.attendance'), icon: STAGE_ICONS[1] },
    { threshold: 4, title: t('timeline.regear'), icon: STAGE_ICONS[2] },
    { threshold: 6, title: t('timeline.pickup'), icon: STAGE_ICONS[3] },
  ]

  const advance = () => {
    const next = advanceDemoJourney(stage)
    setStage(next)
    showToast(t(`toast.${next}`))
  }

  const reset = () => {
    setStage(INITIAL_DEMO_JOURNEY_STAGE)
    showToast(t('toast.reset'))
  }

  return (
    <section
      aria-labelledby="demo-journey-title"
      className="overflow-hidden rounded-xl border border-sky-400/25 bg-gradient-to-br from-sky-500/10 via-surface to-emerald-500/5 shadow-card"
    >
      <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">
            {t('eyebrow')}
          </p>
          <h2 id="demo-journey-title" className="mt-2 text-xl font-black text-white sm:text-2xl">
            {t('title')}
          </h2>
          <p className={cx('mt-2 text-sm leading-relaxed text-gray-300', prettyTextClass)}>
            {t('description')}
          </p>

          <div className="mt-5" aria-label={t('progressLabel', { progress })}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-300">{t('progress')}</span>
              <span className="font-mono font-black text-sky-200">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ol className="mt-5 grid grid-cols-2 gap-2">
            {timeline.map(({ threshold, title, icon: Icon }) => {
              const done = stageIndex >= threshold
              return (
                <li
                  key={threshold}
                  className={cx(
                    'flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                    done
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                      : 'border-border bg-black/15 text-gray-500',
                  )}
                >
                  {done ? <Check size={15} /> : <Icon size={15} />}
                  <span>{title}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="flex min-h-72 flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-gray-300">
                {t(`actors.${STAGE_ACTORS[stage]}`)}
              </span>
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-100">
                {t('browserOnly')}
              </span>
            </div>
            <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
              {t('nextAction')}
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">
              {t(`stages.${stage}.title`)}
            </h3>
            <p className={cx('mt-2 max-w-xl text-sm leading-relaxed text-gray-300', prettyTextClass)}>
              {t(`stages.${stage}.body`)}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!completed && (
              <button
                type="button"
                onClick={advance}
                className={cx(
                  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 transition-colors hover:bg-sky-200',
                  pressScaleClass,
                )}
              >
                {t(`stages.${stage}.action`)}
                <ChevronRight size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className={cx(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900/70 px-4 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800',
                pressScaleClass,
              )}
            >
              <RotateCcw size={15} />
              {t('reset')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
