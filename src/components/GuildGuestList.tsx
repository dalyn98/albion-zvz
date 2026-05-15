'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserX, Users2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { compareStrings } from '@/lib/sort-strings'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { getRoleStyle } from '@/types'
import { revokeGuest } from '@/app/actions/members-admin'
import type { GuildGuestSummary } from '@/app/actions/members-admin'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  guests: GuildGuestSummary[]
  isAdmin: boolean
}

type SortKey = 'participation' | 'recent'

export default function GuildGuestList({ guests, isAdmin }: Props) {
  const t = useTranslations('members')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('recent')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    const base = q ? guests.filter((g) => matchesName(g.username, q)) : guests
    const sorted = [...base]
    if (sortKey === 'participation') {
      sorted.sort((a, b) => {
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return compareStrings(a.username, b.username)
      })
    } else {
      // Most recent invites first — guests are a transient audience so the
      // default sort highlights new arrivals.
      sorted.sort((a, b) => compareStrings(b.joined_at, a.joined_at))
    }
    return sorted
  }, [guests, search, sortKey])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <Users2 size={18} className="text-sky-400" />
        <div className="text-xs text-gray-400">
          {t('guestCounter', { count: guests.length })}
        </div>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />

      <div className="flex items-center gap-2">
        <SortChip active={sortKey === 'recent'} onClick={() => setSortKey('recent')}>
          {t('sortByJoined')}
        </SortChip>
        <SortChip active={sortKey === 'participation'} onClick={() => setSortKey('participation')}>
          {t('sortByParticipation')}
        </SortChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">
          {search ? t('noSearchResult') : t('noGuests')}
        </p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((g) => (
            <GuestRow key={g.discord_id} guest={g} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </div>
  )
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
        active
          ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function GuestRow({ guest, isAdmin }: { guest: GuildGuestSummary; isAdmin: boolean }) {
  const t = useTranslations('members')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const askConfirm = useConfirm()

  const handleRevoke = async () => {
    const ok = await askConfirm({
      body: t('confirmRevokeGuest', { name: guest.username }),
      destructive: true,
    })
    if (!ok) return
    setError('')
    startTransition(async () => {
      const result = await revokeGuest(guest.discord_id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        <MemberAvatar discordId={guest.discord_id} avatar={guest.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-white text-sm font-semibold flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 flex-shrink-0">
              {t('guestBadge')}
            </span>
            <span className="truncate min-w-0">{guest.username}</span>
            <LanguageBadge locale={guest.preferred_language} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {guest.top_roles.length === 0 ? (
              <span className="text-gray-500 text-[11px]">{t('noParticipationHistory')}</span>
            ) : (
              guest.top_roles.map((r) => {
                const style = getRoleStyle(r.role)
                return (
                  <span
                    key={r.role}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      style?.badge ?? 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {translateSlotRole(r.role, tRole)} {r.count}
                  </span>
                )
              })
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sky-400 font-mono font-semibold text-sm">{guest.participation_count}</p>
          <p className="text-gray-500 text-[10px]">{t('participation')}</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleRevoke}
            disabled={pending}
            title={t('revokeGuest')}
            className="flex-shrink-0 text-gray-500 hover:text-red-400 disabled:text-gray-700 p-1.5"
          >
            <UserX size={16} />
          </button>
        )}
      </div>
      {error && (
        <div className="border-t border-red-900/40 bg-red-900/20 px-4 py-2">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}
    </li>
  )
}
