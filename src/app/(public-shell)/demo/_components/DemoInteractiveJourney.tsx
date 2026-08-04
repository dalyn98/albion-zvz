'use client'

import { useTranslations } from 'next-intl'
import {
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  Coins,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import { cx, pressScaleClass, prettyTextClass } from '@/components/ui-patterns'
import {
  DEMO_JOURNEY_ACTORS,
  getDemoJourneyRule,
  getDemoJourneyStageIndex,
  isDemoJourneyComplete,
  type DemoJourneyActor,
} from '@/lib/demo-journey'
import { useDemoToast } from './DemoFeedbackProvider'
import { useDemoSession } from './DemoSessionProvider'

const ACTOR_ICONS: Record<DemoJourneyActor, typeof Users> = {
  operator: ClipboardCheck,
  member: Users,
  crafter: PackageCheck,
}

export default function DemoInteractiveJourney() {
  const t = useTranslations('demo.journey')
  const { showToast } = useDemoToast()
  const { state, projection, setActor, runCommand, reset } = useDemoSession()
  const stageIndex = getDemoJourneyStageIndex(state.stage)
  const completed = isDemoJourneyComplete(state.stage)
  const rule = getDemoJourneyRule(state.stage)
  const canAdvance = rule !== null && state.actor === rule.actor

  const timeline = [
    { threshold: 1, title: t('timeline.publish'), icon: CalendarCheck },
    { threshold: 2, title: t('timeline.signup'), icon: UserCheck },
    { threshold: 4, title: t('timeline.reward'), icon: Coins },
    { threshold: 6, title: t('timeline.regear'), icon: ShieldCheck },
    { threshold: 8, title: t('timeline.pickup'), icon: PackageCheck },
  ]

  const advance = () => {
    if (!rule || !canAdvance) return
    runCommand(rule.command)
    showToast(t(`toast.${rule.next}`))
  }

  const resetJourney = () => {
    reset()
    showToast(t('toast.reset'))
  }

  return (
    <section
      aria-labelledby="demo-journey-title"
      data-demo-journey-stage={state.stage}
      data-demo-journey-actor={state.actor}
      className="overflow-hidden rounded-xl border border-sky-400/25 bg-gradient-to-br from-sky-500/10 via-surface to-emerald-500/5 shadow-card"
    >
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">
              {t('eyebrow')}
            </p>
            <h2 id="demo-journey-title" className="mt-2 text-xl font-black text-white sm:text-2xl">
              {t('title')}
            </h2>
            <p className={cx('mt-2 max-w-3xl text-sm leading-relaxed text-gray-300', prettyTextClass)}>
              {t('description')}
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-100">
            {t('browserOnly')}
          </span>
        </div>

        <div className="mt-5" aria-label={t('progressLabel', { progress: projection.progress })}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-300">{t('progress')}</span>
            <span className="font-mono font-black text-sky-200">{projection.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-300 ease-out"
              style={{ width: `${projection.progress}%` }}
            />
          </div>
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {timeline.map(({ threshold, title, icon: Icon }) => {
            const done = stageIndex >= threshold
            return (
              <li
                key={threshold}
                className={cx(
                  'flex min-h-14 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
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

      <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-xs font-bold text-gray-400">{t('roleSwitch')}</p>
          <div className="mt-3 grid gap-2">
            {DEMO_JOURNEY_ACTORS.map((actor) => {
              const Icon = ACTOR_ICONS[actor]
              const selected = state.actor === actor
              const required = projection.expectedActor === actor && !completed
              return (
                <button
                  key={actor}
                  type="button"
                  data-demo-actor={actor}
                  onClick={() => setActor(actor)}
                  aria-pressed={selected}
                  className={cx(
                    'flex min-h-12 items-center justify-between rounded-lg border px-3 text-left text-xs transition-colors',
                    selected
                      ? 'border-sky-300/50 bg-sky-300/10 text-sky-100'
                      : 'border-border bg-black/15 text-gray-400 hover:border-border-strong hover:text-white',
                    pressScaleClass,
                  )}
                >
                  <span className="inline-flex items-center gap-2 font-bold">
                    <Icon size={15} />
                    {t(`actors.${actor}`)}
                  </span>
                  {required && (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                      {t('requiredActor')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <JourneyMetric
              label={t('metrics.event')}
              value={t(`metrics.eventStatus.${projection.eventStatus}`)}
              tone="sky"
            />
            <JourneyMetric
              label={t('metrics.points')}
              value={projection.memberPoints.toLocaleString()}
              tone="emerald"
            />
            <JourneyMetric
              label={t('metrics.approvals')}
              value={projection.approvalCount.toString()}
              tone={projection.approvalCount ? 'amber' : 'muted'}
            />
            <JourneyMetric
              label={t('metrics.craft')}
              value={projection.craftTaskCount.toString()}
              tone={projection.craftTaskCount ? 'amber' : 'muted'}
            />
            <JourneyMetric
              label={t('metrics.pickup')}
              value={projection.pickupCount.toString()}
              tone={projection.pickupCount ? 'amber' : 'muted'}
            />
            <JourneyMetric
              label={t('metrics.regear')}
              value={t(`metrics.regearStatus.${projection.regearStatus}`)}
              tone="sky"
            />
          </div>
        </div>

        <div className="flex min-h-96 flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-gray-300">
                {t(`actors.${state.actor}`)}
              </span>
              {!completed && (
                <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] font-bold text-sky-100">
                  {t('stepCount', {
                    current: stageIndex + 1,
                    total: 8,
                  })}
                </span>
              )}
            </div>
            <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
              {t('nextAction')}
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">
              {t(`stages.${state.stage}.title`)}
            </h3>
            <p className={cx('mt-2 max-w-xl text-sm leading-relaxed text-gray-300', prettyTextClass)}>
              {t(`stages.${state.stage}.body`)}
            </p>

            {state.stage === 'reward_confirmed' && (
              <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-xs leading-relaxed text-emerald-100">
                {t('rewardSeparation')}
              </div>
            )}
            {!completed && !canAdvance && (
              <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                {t('switchRequired', {
                  actor: t(`actors.${projection.expectedActor}`),
                })}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!completed && (
              <button
                type="button"
                data-demo-next-action
                onClick={advance}
                disabled={!canAdvance}
                className={cx(
                  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 transition-colors hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400',
                  canAdvance && pressScaleClass,
                )}
              >
                {t(`stages.${state.stage}.action`)}
                <ChevronRight size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={resetJourney}
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

function JourneyMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'sky' | 'emerald' | 'amber' | 'muted'
}) {
  const toneClass = {
    sky: 'border-sky-400/20 bg-sky-400/5 text-sky-100',
    emerald: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-100',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
    muted: 'border-border bg-black/15 text-gray-400',
  }[tone]

  return (
    <div className={cx('rounded-lg border p-3', toneClass)}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-black">{value}</p>
    </div>
  )
}
