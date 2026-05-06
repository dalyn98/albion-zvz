'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Users, UserPlus, UserMinus, Globe } from 'lucide-react'

type TabKey = 'members' | 'guests' | 'roster' | 'withdrawn'

interface TabDef {
  key: TabKey
  labelKey: 'tabMembers' | 'tabGuests' | 'tabRoster' | 'tabWithdrawn'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'members', labelKey: 'tabMembers', icon: Users },
  { key: 'roster', labelKey: 'tabRoster', icon: Globe },
  { key: 'guests', labelKey: 'tabGuests', icon: UserPlus },
  { key: 'withdrawn', labelKey: 'tabWithdrawn', icon: UserMinus },
]

interface Props {
  membersCount: number
  rosterCount: number
  guestsCount: number
  withdrawnCount: number
  membersSection: React.ReactNode
  rosterSection: React.ReactNode
  guestsSection: React.ReactNode
  withdrawnSection: React.ReactNode
}

// 실제 MembersPageTabs 비주얼 클론. 4탭 — members/roster/guests/withdrawn.
export default function DemoMembersPageTabs({
  membersCount,
  rosterCount,
  guestsCount,
  withdrawnCount,
  membersSection,
  rosterSection,
  guestsSection,
  withdrawnSection,
}: Props) {
  const t = useTranslations('members')
  const [active, setActive] = useState<TabKey>('members')

  const tabCount = (key: TabKey): number => {
    if (key === 'members') return membersCount
    if (key === 'roster') return rosterCount
    if (key === 'guests') return guestsCount
    return withdrawnCount
  }

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, labelKey, icon: Icon }) => {
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
              {t(labelKey)}
              <span className="text-[11px] text-gray-500 font-mono">{tabCount(key)}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel" hidden={active !== 'members'}>
        {membersSection}
      </div>
      <div role="tabpanel" hidden={active !== 'roster'}>
        {rosterSection}
      </div>
      <div role="tabpanel" hidden={active !== 'guests'}>
        {guestsSection}
      </div>
      <div role="tabpanel" hidden={active !== 'withdrawn'}>
        {withdrawnSection}
      </div>
    </div>
  )
}
