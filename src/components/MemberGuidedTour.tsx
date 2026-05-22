'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Compass, Sparkles, X } from 'lucide-react'

const SCROLL_SETTLE_MS = 420
const HIGHLIGHT_PADDING = 10
const STORAGE_VERSION = 'v1'

interface MemberGuidedTourProps {
  storageScope: string
  eventDetailHref: string | null
}

interface TourStep {
  key: 'events' | 'eventDetail' | 'me' | 'statusChip' | 'regear' | 'exchange'
  href: string
  targetId: string
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function pathWithoutHash(href: string): string {
  return href.split('#')[0] || '/'
}

function findVisibleTourElement(id: string): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll(`[data-tour-id="${id}"]`))
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

function hasBlockingAlbionOnboarding(): boolean {
  return !!document.querySelector('[aria-labelledby="albion-onboarding-title"]')
}

export default function MemberGuidedTour({
  storageScope,
  eventDetailHref,
}: MemberGuidedTourProps) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('memberTour')

  const steps = useMemo<TourStep[]>(
    () => [
      { key: 'events', href: '/', targetId: 'member-tour-events' },
      ...(eventDetailHref
        ? [{ key: 'eventDetail' as const, href: eventDetailHref, targetId: 'member-tour-event-detail' }]
        : []),
      { key: 'me', href: '/me', targetId: 'member-tour-me' },
      { key: 'statusChip', href: '/me', targetId: 'member-tour-status-chip' },
      { key: 'regear', href: '/regear', targetId: 'member-tour-regear' },
      { key: 'exchange', href: '/me#wallet', targetId: 'member-tour-exchange' },
    ],
    [eventDetailHref],
  )

  const seenKey = `app.memberTour.${STORAGE_VERSION}.${storageScope}.seen`
  const progressKey = `app.memberTour.${STORAGE_VERSION}.${storageScope}.progress`

  const [mounted, setMounted] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const shouldOpenIntro = useCallback(() => {
    try {
      return !window.localStorage.getItem(seenKey) && !hasBlockingAlbionOnboarding()
    } catch {
      return false
    }
  }, [seenKey])

  const navigateToStep = useCallback(
    (index: number) => {
      const step = steps[index]
      if (!step) return
      try {
        window.localStorage.setItem(progressKey, String(index))
      } catch {
        // best-effort only
      }
      const nextPath = pathWithoutHash(step.href)
      if (pathname !== nextPath || (step.href.includes('#') && window.location.hash !== `#${step.href.split('#')[1]}`)) {
        router.push(step.href)
      }
    },
    [pathname, progressKey, router, steps],
  )

  useEffect(() => {
    // mount-only localStorage hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    try {
      const rawProgress = window.localStorage.getItem(progressKey)
      if (rawProgress !== null) {
        const savedIndex = Number(rawProgress)
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < steps.length) {
          setStepIndex(savedIndex)
          setActive(true)
          return
        }
        window.localStorage.removeItem(progressKey)
      }
      if (shouldOpenIntro()) {
        setIntroOpen(true)
      }
    } catch {
      // localStorage blocked — no auto tour.
    }
  }, [progressKey, shouldOpenIntro, steps.length])

  useEffect(() => {
    if (!mounted || introOpen || active) return
    if (shouldOpenIntro()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIntroOpen(true)
      return
    }
    const observer = new MutationObserver(() => {
      if (shouldOpenIntro()) {
        setIntroOpen(true)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [active, introOpen, mounted, shouldOpenIntro])

  const measure = useCallback(() => {
    const step = steps[stepIndex]
    if (!step) {
      setRect(null)
      return
    }
    const el = findVisibleTourElement(step.targetId)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [stepIndex, steps])

  useEffect(() => {
    if (!active) return
    const step = steps[stepIndex]
    if (!step) return
    const expectedPath = pathWithoutHash(step.href)
    if (pathname !== expectedPath) {
      navigateToStep(stepIndex)
      return
    }
    const el = findVisibleTourElement(step.targetId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = window.setTimeout(measure, SCROLL_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [active, measure, navigateToStep, pathname, stepIndex, steps])

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
    setRect(null)
    try {
      window.localStorage.setItem(seenKey, '1')
      window.localStorage.removeItem(progressKey)
    } catch {
      // ignore
    }
  }, [progressKey, seenKey])

  const start = useCallback(() => {
    setIntroOpen(false)
    setActive(true)
    setStepIndex(0)
    navigateToStep(0)
  }, [navigateToStep])

  const goNext = useCallback(() => {
    const next = stepIndex + 1
    if (next >= steps.length) {
      dismiss()
      return
    }
    setStepIndex(next)
    navigateToStep(next)
  }, [dismiss, navigateToStep, stepIndex, steps.length])

  const goPrev = useCallback(() => {
    const prev = Math.max(0, stepIndex - 1)
    setStepIndex(prev)
    navigateToStep(prev)
  }, [navigateToStep, stepIndex])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dismiss, goNext, goPrev])

  if (!mounted || steps.length === 0) return null

  const introTitleId = 'member-tour-intro-title'
  const introBodyId = 'member-tour-intro-body'

  if (!active && introOpen) {
    return (
      <>
        <div aria-hidden className="fixed inset-0 z-40 bg-[#08090d]/78" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={introTitleId}
          aria-describedby={introBodyId}
          className="fixed z-50 left-3 right-3 bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-lg w-auto bg-[#11131a] border border-amber-400/40 rounded-xl shadow-2xl"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Compass size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                  {t('eyebrow')}
                </span>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label={t('skip')}
                  className="text-gray-500 hover:text-gray-300 transition-colors -mr-1 -mt-1 p-1"
                >
                  <X size={14} />
                </button>
              </div>
              <h3 id={introTitleId} className="text-sm font-bold text-white leading-tight">
                {t('introTitle')}
              </h3>
              <p id={introBodyId} className="mt-1.5 text-xs text-gray-300 leading-relaxed">
                {t('introBody')}
              </p>
            </div>
          </div>
          <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] text-gray-500 hover:text-gray-300 font-medium transition-colors"
            >
              {t('skip')}
            </button>
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
            >
              {t('start')}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </>
    )
  }

  if (!active) return null

  const step = steps[stepIndex]
  const titleId = 'member-tour-step-title'
  const bodyId = 'member-tour-step-body'

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
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 bg-[#08090d]/78" />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-live="polite"
        className="fixed z-50 left-3 right-3 bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-lg w-auto bg-[#11131a] border border-amber-400/40 rounded-xl shadow-2xl"
      >
        <div className="flex items-start gap-3 p-4">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Sparkles size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                {t('stepCounter', { current: stepIndex + 1, total: steps.length })}
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t('skip')}
                className="text-gray-500 hover:text-gray-300 transition-colors -mr-1 -mt-1 p-1"
              >
                <X size={14} />
              </button>
            </div>
            <h3 id={titleId} className="text-sm font-bold text-white leading-tight">
              {t(`steps.${step.key}.title`)}
            </h3>
            <p id={bodyId} className="mt-1.5 text-xs text-gray-300 leading-relaxed">
              {t(`steps.${step.key}.body`)}
            </p>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-gray-500 hover:text-gray-300 font-medium transition-colors"
          >
            {t('skip')}
          </button>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goPrev}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-md transition-colors"
              >
                <ChevronLeft size={12} />
                {t('back')}
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-md transition-colors"
            >
              {stepIndex + 1 >= steps.length ? t('done') : t('next')}
              {stepIndex + 1 < steps.length && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
