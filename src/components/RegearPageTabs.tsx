'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ShieldCheck, History } from 'lucide-react'

type TabKey = 'eligible' | 'history'

const DEFAULT_TAB: TabKey = 'eligible'

function isTabKey(value: string | null): value is TabKey {
  return value === 'eligible' || value === 'history'
}

interface Props {
  eligibleLabel: string
  historyLabel: string
  eligibleCount: number
  historyCount: number
  eligibleSection: React.ReactNode
  historySection: React.ReactNode
}

export default function RegearPageTabs({
  eligibleLabel,
  historyLabel,
  eligibleCount,
  historyCount,
  eligibleSection,
  historySection,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const active: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB

  const selectTab = (next: TabKey) => {
    if (next === active) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const TABS: { key: TabKey; label: string; count: number; Icon: typeof ShieldCheck }[] = [
    { key: 'eligible', label: eligibleLabel, count: eligibleCount, Icon: ShieldCheck },
    { key: 'history', label: historyLabel, count: historyCount, Icon: History },
  ]

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, label, count, Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
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
