'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Users, UserPlus, UserMinus, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import GuildMemberList from './GuildMemberList'
import GuildGuestList from './GuildGuestList'
import GuildWithdrawnList from './GuildWithdrawnList'
import AlbionRosterList from './AlbionRosterList'
import type {
  GuildMemberSummary,
  GuildGuestSummary,
  WithdrawnMemberSummary,
  AlbionRosterEntry,
} from '@/app/actions/members-admin'

type TabKey = 'members' | 'guests' | 'roster' | 'withdrawn'

interface TabDef {
  key: TabKey
  labelKey: 'tabMembers' | 'tabGuests' | 'tabRoster' | 'tabWithdrawn'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

// 'roster' 는 Albion gameinfo 기반 전 멤버 목록 — Discord 미연동 멤버 포함.
// guests 와 withdrawn 사이에 두면 "활동 멤버 (Discord) → 전체 명부 → 게스트/
// 탈퇴" 흐름이 자연스럽다.
const TABS: readonly TabDef[] = [
  { key: 'members', labelKey: 'tabMembers', icon: Users },
  { key: 'roster', labelKey: 'tabRoster', icon: Globe },
  { key: 'guests', labelKey: 'tabGuests', icon: UserPlus },
  { key: 'withdrawn', labelKey: 'tabWithdrawn', icon: UserMinus },
]

const DEFAULT_TAB: TabKey = 'members'

interface Props {
  members: GuildMemberSummary[]
  guests: GuildGuestSummary[]
  withdrawnMembers: WithdrawnMemberSummary[]
  roster: AlbionRosterEntry[]
  membersError?: string
  guestsError?: string
  withdrawnError?: string
  rosterError?: string
  isAdmin: boolean
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'members' ||
    value === 'guests' ||
    value === 'roster' ||
    value === 'withdrawn'
  )
}

export default function MembersPageTabs({
  members,
  guests,
  withdrawnMembers,
  roster,
  membersError,
  guestsError,
  withdrawnError,
  rosterError,
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

  const tabCount = (key: TabKey): number => {
    if (key === 'members') return members.length
    if (key === 'guests') return guests.length
    if (key === 'roster') return roster.length
    return withdrawnMembers.length
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
              onClick={() => selectTab(key)}
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
        {active === 'roster' && (
          <>
            {rosterError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{rosterError}</p>
              </div>
            )}
            <AlbionRosterList roster={roster} />
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
