'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, RotateCcw, Sparkles } from 'lucide-react'
import { getDemoJourneyStageIndex, isDemoJourneyComplete } from '@/lib/demo-journey'
import { cx, pressScaleClass } from '@/components/ui-patterns'
import { useDemoToast } from './DemoFeedbackProvider'
import { useDemoSession } from './DemoSessionProvider'

export default function DemoJourneyBanner() {
  const pathname = usePathname()
  const t = useTranslations('demo.journey')
  const { showToast } = useDemoToast()
  const { state, projection, reset } = useDemoSession()

  if (!pathname || pathname === '/demo') return null

  const completed = isDemoJourneyComplete(state.stage)
  const stageIndex = getDemoJourneyStageIndex(state.stage)

  return (
    <section className="mb-5 rounded-xl border border-sky-400/25 bg-sky-400/8 px-4 py-3 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
            <Sparkles size={12} />
            {t('eyebrow')} · {projection.progress}%
          </p>
          <p className="mt-1 truncate text-sm font-bold text-white">
            {t(`stages.${state.stage}.title`)}
          </p>
          {!completed && (
            <p className="mt-0.5 text-xs text-gray-400">
              {t(`actors.${projection.expectedActor}`)} · {t('stepCount', { current: stageIndex + 1, total: 8 })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              reset()
              showToast(t('toast.reset'))
            }}
            className={cx(
              'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900/70 px-3 text-xs font-semibold text-gray-300 hover:bg-gray-800',
              pressScaleClass,
            )}
          >
            <RotateCcw size={13} />
            {t('reset')}
          </button>
          <Link
            href="/demo#demo-journey-title"
            className={cx(
              'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-sky-300 px-3 text-xs font-black text-slate-950 hover:bg-sky-200',
              pressScaleClass,
            )}
          >
            {t('nextAction')}
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  )
}
