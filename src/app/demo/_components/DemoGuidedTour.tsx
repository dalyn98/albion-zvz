'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, X, Compass, Sparkles } from 'lucide-react'

const STORAGE_KEY = 'demo.tour.seen'
const SCROLL_SETTLE_MS = 380
const HIGHLIGHT_PADDING = 10

interface Step {
  id: string
}

const STEPS: readonly Step[] = [
  { id: 'hero' },
  { id: 'admin-pending' },
  { id: 'member-dashboard' },
  { id: 'weekly-kpi' },
  { id: 'recent-battle' },
  { id: 'weapon-distribution' },
] as const

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export default function DemoGuidedTour() {
  const t = useTranslations('demo.tour')
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    setMounted(true)
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY)
      if (!seen) setActive(true)
    } catch {
      // localStorage blocked — leave inactive
    }
  }, [])

  const measure = useCallback(() => {
    if (step >= STEPS.length) {
      setRect(null)
      return
    }
    const el = document.querySelector(
      `[data-tour-id="${STEPS[step].id}"]`,
    ) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  useEffect(() => {
    if (!active) return
    if (step >= STEPS.length) {
      setRect(null)
      return
    }
    const el = document.querySelector(
      `[data-tour-id="${STEPS[step].id}"]`,
    ) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t1 = window.setTimeout(measure, SCROLL_SETTLE_MS)
    return () => window.clearTimeout(t1)
  }, [active, step, measure])

  useEffect(() => {
    if (!active) return
    const onResize = () => measure()
    const onScroll = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
    }
  }, [active, measure])

  const dismiss = useCallback(() => {
    setActive(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }, [])

  const handleNext = useCallback(() => {
    if (step >= STEPS.length) {
      dismiss()
      return
    }
    setStep((s) => s + 1)
  }, [step, dismiss])

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  const handleStart = useCallback(() => {
    setStep(0)
    setActive(true)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
      else if (e.key === 'ArrowRight') handleNext()
      else if (e.key === 'ArrowLeft') handlePrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dismiss, handleNext, handlePrev])

  if (!mounted) return null

  if (!active) {
    return (
      <button
        type="button"
        onClick={handleStart}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3.5 py-2.5 rounded-full shadow-[0_8px_30px_-6px_rgba(251,191,36,0.5)] transition-colors"
      >
        <Compass size={13} />
        {t('restartButton')}
      </button>
    )
  }

  const isCompleted = step >= STEPS.length
  const stepIndex = isCompleted ? STEPS.length : step + 1
  const totalSteps = STEPS.length

  const titleKey = isCompleted ? 'completedTitle' : `step${step + 1}Title`
  const bodyKey = isCompleted ? 'completedBody' : `step${step + 1}Body`

  return (
    <>
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: rect.top - HIGHLIGHT_PADDING,
            left: rect.left - HIGHLIGHT_PADDING,
            width: rect.width + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
            borderRadius: 14,
            boxShadow:
              '0 0 0 9999px rgba(8, 9, 13, 0.78), 0 0 0 2px rgba(251, 191, 36, 0.85)',
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 bg-[#08090d]/78 transition-opacity duration-300"
        />
      )}

      <div
        role="dialog"
        aria-live="polite"
        className="fixed z-50 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-4 sm:max-w-lg w-auto bg-[#11131a] border border-amber-400/40 rounded-xl shadow-2xl"
      >
        <div className="flex items-start gap-3 p-4">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {isCompleted ? <Sparkles size={14} /> : <Compass size={14} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                {isCompleted
                  ? t('completedTitle')
                  : t('stepCounter', { current: stepIndex, total: totalSteps })}
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t('skipButton')}
                className="text-gray-500 hover:text-gray-300 transition-colors -mr-1 -mt-1 p-1"
              >
                <X size={14} />
              </button>
            </div>
            <h3 className="text-sm font-bold text-white leading-tight">
              {t(titleKey)}
            </h3>
            <p className="mt-1.5 text-xs text-gray-300 leading-relaxed">
              {t(bodyKey)}
            </p>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-gray-500 hover:text-gray-300 font-medium transition-colors"
          >
            {t('skipButton')}
          </button>
          <div className="flex items-center gap-1.5">
            {step > 0 && !isCompleted && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-md transition-colors"
              >
                <ChevronLeft size={12} />
                {t('backButton')}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
            >
              {isCompleted ? t('doneButton') : t('nextButton')}
              {!isCompleted && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
