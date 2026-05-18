'use client'

import { useDemoToast } from './DemoFeedbackProvider'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// 데모 라우트 server-rendered 페이지에서 "실제 같은 버튼" 을 만들 때 쓰는 wrapper.
// disabled 대신 토스트를 띄워, 마우스 오버 시 가능해 보이고 클릭하면 "데모용 작업
// 이라 저장되지 않아요" 안내가 뜬다.

interface DemoActionButtonProps {
  className: string
  children: ReactNode
  ariaLabel?: string
  asDiv?: boolean
}

export default function DemoActionButton({
  className,
  children,
  ariaLabel,
  asDiv = false,
}: DemoActionButtonProps) {
  const tFeedback = useTranslations('demo.feedback')
  const { showToast } = useDemoToast()
  const onClick = () => showToast(tFeedback('actionAcknowledged'))

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </div>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  )
}
