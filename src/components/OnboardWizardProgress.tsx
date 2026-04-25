'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'

interface Props {
  tenantId: string
  stepOf: string
  labels: [string, string, string]
}

// 현재 경로에서 스텝 인덱스를 유도. pathname 이 /onboard/setup/[id] 형태면 1,
// /onboard/setup/[id]/albion 이면 2, /onboard/setup/[id]/rewards 이면 3.
function resolveStepIndex(pathname: string, tenantId: string): 1 | 2 | 3 {
  if (pathname.endsWith(`/onboard/setup/${tenantId}/rewards`)) return 3
  if (pathname.endsWith(`/onboard/setup/${tenantId}/albion`)) return 2
  return 1
}

function stepHref(tenantId: string, idx: 1 | 2 | 3): string {
  if (idx === 1) return `/onboard/setup/${tenantId}`
  if (idx === 2) return `/onboard/setup/${tenantId}/albion`
  return `/onboard/setup/${tenantId}/rewards`
}

export default function OnboardWizardProgress({ tenantId, stepOf, labels }: Props) {
  const pathname = usePathname() ?? ''
  const current = resolveStepIndex(pathname, tenantId)
  const total = labels.length

  return (
    <div className="space-y-2 mb-6">
      <p className="text-xs text-gray-400 font-mono">
        {stepOf.replace('{current}', String(current)).replace('{total}', String(total))}
      </p>
      <ol className="flex items-center gap-2 text-xs">
        {labels.map((label, i) => {
          const idx = (i + 1) as 1 | 2 | 3
          const state: 'done' | 'active' | 'upcoming' =
            idx < current ? 'done' : idx === current ? 'active' : 'upcoming'
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
                  href={stepHref(tenantId, idx)}
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
