'use client'

import { useEffect, useState, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Users, UserPlus, UserMinus, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import GuildMemberList from './GuildMemberList'
import GuildGuestList from './GuildGuestList'
import GuildWithdrawnList from './GuildWithdrawnList'
import AlbionRosterList from './AlbionRosterList'
import { listMembersDirectoryTab } from '@/app/actions/members-admin'
import type {
  GuildMemberSummary,
  GuildGuestSummary,
  WithdrawnMemberSummary,
  AlbionRosterEntry,
  MembersDirectoryCounts,
  MembersDirectoryResult,
  MembersDirectoryTab,
} from '@/app/actions/members-admin'

type TabKey = MembersDirectoryTab

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
  counts: MembersDirectoryCounts
  initialLoadedTab: TabKey
  preloadedTabs?: readonly TabKey[]
  visibleTabs?: readonly TabKey[]
  canManageGuests: boolean
  timezone: string
  memberHrefPrefix?: string
  albionMemberHrefPrefix?: string | null
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'members' ||
    value === 'guests' ||
    value === 'roster' ||
    value === 'withdrawn'
  )
}

function mergeDirectoryTabResult(
  current: MembersDirectoryResult,
  tab: TabKey,
  result: MembersDirectoryResult,
): MembersDirectoryResult {
  return {
    ...current,
    ...(tab === 'members'
      ? { members: result.members, membersError: result.membersError }
      : {}),
    ...(tab === 'guests'
      ? { guests: result.guests, guestsError: result.guestsError }
      : {}),
    ...(tab === 'roster'
      ? { roster: result.roster, rosterError: result.rosterError }
      : {}),
    ...(tab === 'withdrawn'
      ? {
          withdrawnMembers: result.withdrawnMembers,
          withdrawnError: result.withdrawnError,
        }
      : {}),
  }
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
  counts,
  initialLoadedTab,
  preloadedTabs,
  visibleTabs,
  canManageGuests,
  timezone,
  memberHrefPrefix,
  albionMemberHrefPrefix,
}: Props) {
  const t = useTranslations('members')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null)
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(
    () => new Set(preloadedTabs ?? [initialLoadedTab]),
  )
  const [directory, setDirectory] = useState<MembersDirectoryResult>({
    members,
    guests,
    withdrawnMembers,
    roster,
    membersError,
    guestsError,
    withdrawnError,
    rosterError,
  })

  const rawTab = searchParams.get('tab')
  const tabs = visibleTabs?.length
    ? TABS.filter((tab) => visibleTabs.includes(tab.key))
    : TABS
  const defaultTab = tabs[0]?.key ?? DEFAULT_TAB
  const active: TabKey =
    isTabKey(rawTab) && tabs.some((tab) => tab.key === rawTab)
      ? rawTab
      : defaultTab

  const mergeTabResult = (tab: TabKey, result: MembersDirectoryResult) => {
    setDirectory((prev) => mergeDirectoryTabResult(prev, tab, result))
    setLoadedTabs((prev) => new Set(prev).add(tab))
  }

  const ensureTabLoaded = (tab: TabKey) => {
    if (loadedTabs.has(tab)) return
    setPendingTab(tab)
    startTransition(() => {
      void listMembersDirectoryTab(tab)
        .then((result) => mergeTabResult(tab, result))
        .finally(() => setPendingTab((current) => (current === tab ? null : current)))
    })
  }

  useEffect(() => {
    if (loadedTabs.has(active) || pendingTab === active) return
    let cancelled = false
    void listMembersDirectoryTab(active).then((result) => {
      if (cancelled) return
      setDirectory((prev) => mergeDirectoryTabResult(prev, active, result))
      setLoadedTabs((prev) => new Set(prev).add(active))
    })
    return () => {
      cancelled = true
    }
  }, [active, loadedTabs, pendingTab])

  const selectTab = (next: TabKey) => {
    if (next === active) return
    ensureTabLoaded(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === defaultTab) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const tabCount = (key: TabKey): number => {
    if (key === 'members') return counts.members
    if (key === 'guests') return counts.guests
    if (key === 'roster') return counts.roster
    return counts.withdrawn
  }

  const isTabPending = (tab: TabKey): boolean =>
    (isPending && pendingTab === tab) || (!loadedTabs.has(tab) && active === tab)

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {tabs.map(({ key, labelKey, icon: Icon }) => {
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
              <span className="text-[11px] text-gray-500 font-mono">
                {isTabPending(key) ? '...' : tabCount(key)}
              </span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel">
        {active === 'members' && (
          <>
            {directory.membersError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{directory.membersError}</p>
              </div>
            )}
            {isTabPending('members') ? (
              <p className="text-gray-500 text-sm text-center py-8">{tCommon('loading')}</p>
            ) : directory.members.length === 0 && !directory.membersError ? (
              <p className="text-gray-500 text-sm text-center py-8">{t('none')}</p>
            ) : (
              <GuildMemberList members={directory.members} memberHrefPrefix={memberHrefPrefix} />
            )}
          </>
        )}
        {active === 'roster' && (
          <>
            {directory.rosterError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{directory.rosterError}</p>
              </div>
            )}
            {isTabPending('roster') ? (
              <p className="text-gray-500 text-sm text-center py-8">{tCommon('loading')}</p>
            ) : (
              <AlbionRosterList
                roster={directory.roster}
                memberHrefPrefix={memberHrefPrefix}
                albionMemberHrefPrefix={albionMemberHrefPrefix}
              />
            )}
          </>
        )}
        {active === 'guests' && (
          <>
            {directory.guestsError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{directory.guestsError}</p>
              </div>
            )}
            {isTabPending('guests') ? (
              <p className="text-gray-500 text-sm text-center py-8">{tCommon('loading')}</p>
            ) : (
              <GuildGuestList guests={directory.guests} canManageGuests={canManageGuests} />
            )}
          </>
        )}
        {active === 'withdrawn' && (
          <>
            {directory.withdrawnError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                <p className="text-red-400 text-sm">{directory.withdrawnError}</p>
              </div>
            )}
            {isTabPending('withdrawn') ? (
              <p className="text-gray-500 text-sm text-center py-8">{tCommon('loading')}</p>
            ) : (
              <GuildWithdrawnList
                members={directory.withdrawnMembers}
                timezone={timezone}
                memberHrefPrefix={memberHrefPrefix}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
