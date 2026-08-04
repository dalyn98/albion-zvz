'use client'

import { useSearchParams } from 'next/navigation'

export default function DemoCaptureFrame({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const isMarketingCapture = searchParams.get('marketing') === '1'

  return (
    <div
      className={`visual-refresh-v3 visual-refresh-v4 min-h-screen bg-[#0b0d12] text-white${isMarketingCapture ? ' demo-marketing-capture' : ''}`}
      data-visual-refresh="v4"
      data-marketing-capture={isMarketingCapture ? 'true' : undefined}
    >
      {children}
    </div>
  )
}
