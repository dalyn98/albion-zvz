'use client'

import { useDemoToast } from './DemoFeedbackProvider'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// 데모 라우트 server-rendered 페이지에서 "실제 같은 버튼" 을 만들 때 쓰는 wrapper.
// disabled 가 아니면 토스트를 띄워 "데모용 작업이라 저장되지 않아요" 안내.
// disabled=true 면 진짜 비활성화 — 클릭/포커스/키보드 액션 모두 차단.

interface DemoActionButtonProps {
  className: string
  children: ReactNode
  ariaLabel?: string
  asDiv?: boolean
  disabled?: boolean
}

export default function DemoActionButton({
  className,
  children,
  ariaLabel,
  asDiv = false,
  disabled = false,
}: DemoActionButtonProps) {
  const tFeedback = useTranslations('demo.feedback')
  const { showToast } = useDemoToast()
  const onClick = () => {
    if (disabled) return
    showToast(tFeedback('actionAcknowledged'))
  }

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={className}
      >
        {children}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  )
}
