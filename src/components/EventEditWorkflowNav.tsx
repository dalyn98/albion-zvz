'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cx, pressableClass } from './ui-patterns'

interface Props {
  hasRegearSection: boolean
}

type StepId = 'details' | 'regear' | 'attendance' | 'roster'

const STEP_IDS: Record<StepId, string> = {
  details: 'event-edit-details',
  regear: 'event-edit-regear',
  attendance: 'event-edit-attendance',
  roster: 'event-edit-roster',
}

/**
 * Long event-edit pages keep every control in one save transaction. This
 * navigator adds wayfinding only: links use regular document anchors, so it
 * cannot alter form state, save registration, or permission behaviour.
 */
export default function EventEditWorkflowNav({ hasRegearSection }: Props) {
  const t = useTranslations('adminEditEvent')
  const steps = useMemo<StepId[]>(
    () => (hasRegearSection ? ['details', 'regear', 'attendance', 'roster'] : ['details', 'attendance', 'roster']),
    [hasRegearSection],
  )
  const [activeStep, setActiveStep] = useState<StepId>('details')

  useEffect(() => {
    const elements = steps
      .map((step) => document.getElementById(STEP_IDS[step]))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!visible) return
        const matchingStep = steps.find((step) => STEP_IDS[step] === visible.target.id)
        if (matchingStep) setActiveStep(matchingStep)
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: 0 },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [steps])

  return (
    <nav
      aria-label={t('workflowNav.label')}
      className="sticky top-3 z-20 -mx-1 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/95 p-1.5 shadow-lg shadow-black/20 backdrop-blur sm:mx-0"
    >
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((step, index) => {
          const isActive = activeStep === step
          return (
            <li key={step}>
              <a
                href={`#${STEP_IDS[step]}`}
                onClick={() => setActiveStep(step)}
                aria-current={isActive ? 'step' : undefined}
                className={cx(
                  'inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm',
                  pressableClass,
                  isActive
                    ? 'bg-amber-500 text-black'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid h-4 w-4 place-items-center rounded-full text-[10px]',
                    isActive ? 'bg-black/15' : 'bg-gray-800 text-gray-500',
                  )}
                >
                  {index + 1}
                </span>
                {t(`workflowNav.${step}`)}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
