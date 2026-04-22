'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Users, UserPlus, UserMinus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import GuildMemberList from './GuildMemberList'
import GuildGuestList from './GuildGuestList'
import GuildWithdrawnList from './GuildWithdrawnList'
import type {
  GuildMemberSummary,
  GuildGuestSummary,
  WithdrawnMemberSummary,
} from '@/app/actions/members-admin'

type TabKey = 'members' | 'guests' | 'withdrawn'

interface TabDef {
  key: TabKey
  labelKey: 'tabMembers' | 'tabGuests' | 'tabWithdrawn'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'members', labelKey: 'tabMembers', icon: Users },
  { key: 'guests', labelKey: 'tabGuests', icon: UserPlus },
  { key: 'withdrawn', labelKey: 'tabWithdrawn', icon: UserMinus },
]

const DEFAULT_TAB: TabKey = 'members'

interface Props {
  members: GuildMemberSummary[]
  guests: GuildGuestSummary[]
  withdrawnMembers: WithdrawnMemberSummary[]
  membersError?: string
  guestsError?: string
  withdrawnError?: string
  isAdmin: boolean
}

function isTabKey(value: string | null): value is TabKey {
  return value === 'members' || value === 'guests' || value === 'withdrawn'
}

export default function MembersPageTabs({
  members,
  guests,
  withdrawnMembers,
  membersError,
  guestsError,
  withdrawnError,
  isAdmin,
}: Props) {
  const t = useTranslations('members')
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

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, labelKey, icon: Icon }) => {
          const isActive = active === key
          const count =
            key === 'members'
              ? members.length
              : key === 'guests'
                ? guests.length
                : withdrawnMembers.length
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
              {t(labelKey)}
              <span className="text-[11px] text-gray-500 font-mono">{count}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel">
        {active === 'members' && (
          <>
            {membersError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{membersError}</p>
              </div>
            )}
            {members.length === 0 && !membersError ? (
              <p className="text-gray-500 text-sm text-center py-8">{t('none')}</p>
            ) : (
              <GuildMemberList members={members} />
            )}
          </>
        )}
        {active === 'guests' && (
          <>
            {guestsError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{guestsError}</p>
              </div>
            )}
            <GuildGuestList guests={guests} isAdmin={isAdmin} />
          </>
        )}
        {active === 'withdrawn' && (
          <>
            {withdrawnError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{withdrawnError}</p>
              </div>
            )}
            <GuildWithdrawnList members={withdrawnMembers} />
          </>
        )}
      </div>
    </div>
  )
}
