'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import {
  ONBOARD_SETUP_STEPS,
  onboardSetupHref,
  resolveOnboardSetupStep,
  resolveOnboardStepState,
} from '@/lib/onboard-guide'

interface Props {
  tenantId: string
  labels: [string, string, string]
}

export default function OnboardWizardProgress({ tenantId, labels }: Props) {
  const t = useTranslations('onboard')
  const pathname = usePathname() ?? ''
  const current = resolveOnboardSetupStep(pathname, tenantId)
  const total = labels.length

  return (
    <div className="space-y-2 mb-6">
      <p className="text-xs text-gray-400 font-mono">
        {t('stepOf', { current, total })}
      </p>
      <ol className="flex items-center gap-2 text-xs">
        {ONBOARD_SETUP_STEPS.map((idx, i) => {
          const label = labels[i]
          const state = resolveOnboardStepState(idx, current)
          // 완료된 스텝만 링크화 — 미래 스텝은 레이아웃이 ownership 만 검증하지
          // 진행 순서를 강제하지 않으므로 굳이 점프 가능하게 하지 않는다.
          const isClickable = state === 'done'
          const dotClass = `flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-semibold ${
            state === 'done'
              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
              : state === 'active'
                ? 'border-[#5865F2] bg-[#5865F2]/20 text-white'
                : 'border-white/10 bg-white/5 text-gray-500'
          }`
          const labelClass = `truncate ${
            state === 'active'
              ? 'text-white font-medium'
              : state === 'done'
                ? 'text-emerald-300 hover:text-emerald-200'
                : 'text-gray-500'
          }`
          const inner = (
            <>
              <span className={dotClass}>
                {state === 'done' ? <Check size={12} /> : idx}
              </span>
              <span className={labelClass}>{label}</span>
            </>
          )
          return (
            <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
              {isClickable ? (
                <Link
                  href={onboardSetupHref(tenantId, idx)}
                  className="flex items-center gap-2 min-w-0 flex-1"
                >
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-2 min-w-0 flex-1">{inner}</span>
              )}
              {i < labels.length - 1 && (
                <span className="flex-1 h-px bg-white/10" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
