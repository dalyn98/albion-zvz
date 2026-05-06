'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Clock, CheckCircle2, XCircle } from 'lucide-react'

type TabKey = 'pending' | 'approved' | 'rejected'

interface Props {
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  pendingSection: React.ReactNode
  approvedSection: React.ReactNode
  rejectedSection: React.ReactNode
}

export default function DemoApprovalsTabs({
  pendingCount,
  approvedCount,
  rejectedCount,
  pendingSection,
  approvedSection,
  rejectedSection,
}: Props) {
  const t = useTranslations('demo.approvals')
  const [active, setActive] = useState<TabKey>('pending')

  const TABS: { key: TabKey; label: string; count: number; Icon: typeof Clock }[] = [
    { key: 'pending', label: t('tabPending'), count: pendingCount, Icon: Clock },
    { key: 'approved', label: t('tabApproved'), count: approvedCount, Icon: CheckCircle2 },
    { key: 'rejected', label: t('tabRejected'), count: rejectedCount, Icon: XCircle },
  ]

  return (
    <div className="space-y-4">
      <nav role="tablist" className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {TABS.map(({ key, label, count, Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
              <span className="text-[11px] text-gray-500 font-mono">{count}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel" hidden={active !== 'pending'}>
        {pendingSection}
      </div>
      <div role="tabpanel" hidden={active !== 'approved'}>
        {approvedSection}
      </div>
      <div role="tabpanel" hidden={active !== 'rejected'}>
        {rejectedSection}
      </div>
    </div>
  )
}
