'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, X, Compass, Sparkles, Home } from 'lucide-react'
import {
  getTourCoachmarkPosition,
  type TourTargetRect,
} from '@/lib/tour-coachmark'

const SCROLL_SETTLE_MS = 380
const HIGHLIGHT_PADDING = 10
const TOUR_DIM_COLOR = 'rgba(8, 9, 13, 0.52)'
const OFFICIAL_HOME_HREF = 'https://albion-guildmanager.com/'

interface Step {
  id: string
}

interface DemoGuidedTourProps {
  steps: ReadonlyArray<Step>
  namespace: string
  autoStart?: boolean
}

export default function DemoGuidedTour({
  steps,
  namespace,
  autoStart = false,
}: DemoGuidedTourProps) {
  const tUi = useTranslations('demo.tour.ui')
  const tPage = useTranslations(`demo.tour.pages.${namespace}`)
  const storageKey = `demo.tour.${namespace}.seen`

  const [mounted, setMounted] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<TourTargetRect | null>(null)

  useEffect(() => {
    // SSR hydration 직후 mount 플래그 + localStorage 기반 autoStart 결정.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only init
    setMounted(true)
    if (!autoStart) return
    try {
      const seen = window.localStorage.getItem(storageKey)
      if (!seen) setIntroOpen(true)
    } catch {
      // localStorage blocked — leave inactive
    }
  }, [autoStart, storageKey])

  const measure = useCallback(() => {
    if (step >= steps.length) {
      setRect(null)
      return
    }
    const el = document.querySelector(
      `[data-tour-id="${steps[step].id}"]`,
    ) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  }, [step, steps])

  useEffect(() => {
    if (!active) return
    if (step >= steps.length) {
      // 투어 끝 — measure 가 가리킬 대상 없음. effect 안 reset 은 의도된 사이클 종료.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null)
      return
    }
    const el = document.querySelector(
      `[data-tour-id="${steps[step].id}"]`,
    ) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t1 = window.setTimeout(measure, SCROLL_SETTLE_MS)
    return () => window.clearTimeout(t1)
  }, [active, step, measure, steps])

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
    setIntroOpen(false)
    setActive(false)
    if (!autoStart) return
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
  }, [autoStart, storageKey])

  const handleNext = useCallback(() => {
    if (step >= steps.length) {
      dismiss()
      return
    }
    setStep((s) => s + 1)
  }, [step, dismiss, steps])

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  const handleStart = useCallback(() => {
    setIntroOpen(false)
    setStep(0)
    setActive(true)
  }, [])

  const handleOpenIntro = useCallback(() => {
    setIntroOpen(true)
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

  const introTitleId = `demo-tour-intro-title-${namespace}`
  const introBodyId = `demo-tour-intro-body-${namespace}`

  if (!active && introOpen) {
    return (
      <>
        <div
          aria-hidden
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: TOUR_DIM_COLOR }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={introTitleId}
          aria-describedby={introBodyId}
          className="tour-coachmark tour-mobile-sheet fixed z-50 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-4 sm:max-w-lg w-auto bg-[#11131a] border border-amber-400/40 rounded-xl shadow-2xl"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Compass size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                  {tUi('introEyebrow')}
                </span>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label={tUi('skipButton')}
                  className="-mr-2 -mt-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                >
                  <X size={14} />
                </button>
              </div>
              <h3 id={introTitleId} className="text-sm font-bold text-white leading-tight">
                {tPage('introTitle')}
              </h3>
              <p id={introBodyId} className="mt-1.5 text-xs text-gray-300 leading-relaxed">
                {tPage('introBody')}
              </p>
            </div>
          </div>
          <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <a
                href={OFFICIAL_HOME_HREF}
                className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Home size={11} />
                {tUi('officialHomeButton')}
              </a>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex min-h-10 items-center rounded-md px-2 text-[11px] font-medium text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
              >
                {tUi('skipButton')}
              </button>
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex min-h-10 items-center gap-1 rounded-md bg-amber-500 px-3 text-xs font-bold text-black transition-colors hover:bg-amber-400"
            >
              {tUi('startButton')}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </>
    )
  }

  if (!active) {
    const launcherTarget = document.getElementById('demo-tour-launcher')
    if (!launcherTarget) return null
    return createPortal(
      <button
        type="button"
        onClick={handleOpenIntro}
        aria-label={tUi('restartButton')}
        className="tour-restart-trigger inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold text-amber-200 transition-[background-color,color,transform] hover:bg-amber-500/10 hover:text-amber-100 active:scale-[0.96] sm:text-xs"
      >
        <Compass size={13} />
        <span className="tour-restart-label hidden sm:inline">{tUi('restartButton')}</span>
      </button>,
      launcherTarget,
    )
  }

  const isCompleted = step >= steps.length
  const stepIndex = isCompleted ? steps.length : step + 1
  const totalSteps = steps.length

  const titleText = isCompleted ? tUi('completedTitle') : tPage(`step${step + 1}Title`)
  const bodyText = isCompleted ? tPage('completedBody') : tPage(`step${step + 1}Body`)
  const titleId = `demo-tour-title-${namespace}`
  const bodyId = `demo-tour-body-${namespace}`
  const coachmarkPosition = rect ? getTourCoachmarkPosition(rect) : undefined

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
              `0 0 0 9999px ${TOUR_DIM_COLOR}, 0 0 0 2px rgba(251, 191, 36, 0.85)`,
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: TOUR_DIM_COLOR }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-live="polite"
        className={`tour-coachmark tour-mobile-sheet fixed z-50 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-4 sm:max-w-lg w-auto bg-[#11131a] border border-amber-400/40 rounded-xl shadow-2xl${coachmarkPosition ? ' tour-contextual-position' : ''}`}
        style={coachmarkPosition}
      >
        <div className="flex items-start gap-3 p-4">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {isCompleted ? <Sparkles size={14} /> : <Compass size={14} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                {isCompleted
                  ? tUi('completedTitle')
                  : tUi('stepCounter', { current: stepIndex, total: totalSteps })}
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label={tUi('skipButton')}
                className="-mr-2 -mt-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
              >
                <X size={14} />
              </button>
            </div>
            <h3 id={titleId} className="text-sm font-bold text-white leading-tight">{titleText}</h3>
            <p id={bodyId} className="mt-1.5 text-xs text-gray-300 leading-relaxed">{bodyText}</p>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <a
              href={OFFICIAL_HOME_HREF}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Home size={11} />
              {tUi('officialHomeButton')}
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-10 items-center rounded-md px-2 text-[11px] font-medium text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
            >
              {tUi('skipButton')}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {step > 0 && !isCompleted && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gray-700 px-3 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                <ChevronLeft size={12} />
                {tUi('backButton')}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex min-h-10 items-center gap-1 rounded-md bg-amber-500 px-3 text-xs font-bold text-black transition-colors hover:bg-amber-400"
            >
              {isCompleted ? tUi('doneButton') : tUi('nextButton')}
              {!isCompleted && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
