'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldCheck, History } from 'lucide-react'

type TabKey = 'eligible' | 'history'

interface Props {
  eligibleCount: number
  historyCount: number
  eligibleSection: React.ReactNode
  historySection: React.ReactNode
}

// 실제 RegearPageTabs 비주얼 클론. searchParams 동기화는 데모에선 불필요해
// 단순 in-memory state.
export default function DemoRegearTabs({
  eligibleCount,
  historyCount,
  eligibleSection,
  historySection,
}: Props) {
  const t = useTranslations('regear')
  const [active, setActive] = useState<TabKey>('eligible')

  const TABS: { key: TabKey; label: string; count: number; Icon: typeof ShieldCheck }[] = [
    { key: 'eligible', label: t('tabEligible'), count: eligibleCount, Icon: ShieldCheck },
    { key: 'history', label: t('tabHistory'), count: historyCount, Icon: History },
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

      <div role="tabpanel" hidden={active !== 'eligible'}>
        {eligibleSection}
      </div>
      <div role="tabpanel" hidden={active !== 'history'}>
        {historySection}
      </div>
    </div>
  )
}
