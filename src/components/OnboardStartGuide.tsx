'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDot,
  Flag,
  LockKeyhole,
  ListChecks,
} from 'lucide-react'
import {
  ONBOARD_SETUP_STEPS,
  onboardSetupHref,
  resolveOnboardSetupStep,
  resolveOnboardStepState,
  type OnboardStepState,
} from '@/lib/onboard-guide'

interface GuideCopy {
  title: string
  body: string
}

interface PageCreationContext {
  title: string
  description: string
  statusLabel: string
  statusValue: string
  addressLabel: string
  address: string
  visibilityLabel: string
  visibilityValue: string
}

interface Props {
  tenantId: string
  eyebrow: string
  title: string
  description: string
  currentStepLabel: string
  afterSetupLabel: string
  statusLabels: Record<OnboardStepState, string>
  steps: [GuideCopy, GuideCopy, GuideCopy]
  afterItems: [GuideCopy, GuideCopy, GuideCopy]
  pageCreation?: PageCreationContext
}

function statusIcon(state: OnboardStepState) {
  if (state === 'done') return <CheckCircle2 size={15} className="text-emerald-300" />
  if (state === 'active') return <CircleDot size={15} className="text-[#8EA0FF]" />
  return <Circle size={15} className="text-gray-500" />
}

function statusClass(state: OnboardStepState): string {
  if (state === 'done') return 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10'
  if (state === 'active') return 'text-[#CAD2FF] border-[#5865F2]/40 bg-[#5865F2]/15'
  return 'text-gray-500 border-white/10 bg-white/5'
}

export default function OnboardStartGuide({
  tenantId,
  eyebrow,
  title,
  description,
  currentStepLabel,
  afterSetupLabel,
  statusLabels,
  steps,
  afterItems,
  pageCreation,
}: Props) {
  const pathname = usePathname() ?? ''
  const current = resolveOnboardSetupStep(pathname, tenantId)

  return (
    <section
      aria-labelledby="onboard-start-guide-title"
      className="mb-6 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#5865F2]/35 bg-[#5865F2]/15 text-[#CAD2FF]">
          <ListChecks size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-[#CAD2FF]">{eyebrow}</p>
          <h2 id="onboard-start-guide-title" className="mt-1 text-base font-semibold text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">{description}</p>
        </div>
      </div>

      {pageCreation && (
        <div className="mt-4 border-y border-white/10 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/10 text-emerald-200">
              <LockKeyhole size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{pageCreation.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                {pageCreation.description}
              </p>
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-gray-500">{pageCreation.statusLabel}</dt>
                  <dd className="mt-1 font-semibold text-emerald-200">
                    {pageCreation.statusValue}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-gray-500">{pageCreation.addressLabel}</dt>
                  <dd className="mt-1 truncate font-semibold text-gray-200">
                    {pageCreation.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{pageCreation.visibilityLabel}</dt>
                  <dd className="mt-1 font-semibold text-[#CAD2FF]">
                    {pageCreation.visibilityValue}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)]">
        <div>
          <h3 className="text-xs font-semibold text-gray-300">{currentStepLabel}</h3>
          <ol className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10">
            {ONBOARD_SETUP_STEPS.map((step, i) => {
              const state = resolveOnboardStepState(step, current)
              const copy = steps[i]
              const row = (
                <span className="flex items-start gap-3 p-3">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    {statusIcon(state)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{copy.title}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(state)}`}
                      >
                        {statusLabels[state]}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-400">
                      {copy.body}
                    </span>
                  </span>
                  {state === 'done' && (
                    <ArrowRight size={13} className="mt-1 flex-shrink-0 text-emerald-300" />
                  )}
                </span>
              )
              return (
                <li key={copy.title}>
                  {state === 'done' ? (
                    <Link
                      href={onboardSetupHref(tenantId, step)}
                      className="block transition-colors hover:bg-white/[0.04]"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-300">{afterSetupLabel}</h3>
          <ul className="mt-2 space-y-3 rounded-lg border border-white/10 p-3">
            {afterItems.map((item) => (
              <li key={item.title} className="flex items-start gap-2.5">
                <Flag size={13} className="mt-0.5 flex-shrink-0 text-emerald-300" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
