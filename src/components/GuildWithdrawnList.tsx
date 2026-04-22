'use client'

import { useMemo, useState } from 'react'
import { UserMinus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { getRoleStyle } from '@/types'
import type { WithdrawnMemberSummary } from '@/app/actions/members-admin'

interface Props {
  members: WithdrawnMemberSummary[]
}

type SortKey = 'withdrawnAt' | 'participation'

export default function GuildWithdrawnList({ members }: Props) {
  const t = useTranslations('members')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('withdrawnAt')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    const base = q ? members.filter((m) => matchesName(m.username, q)) : members
    const sorted = [...base]
    if (sortKey === 'participation') {
      sorted.sort((a, b) => {
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return a.username.localeCompare(b.username)
      })
    } else {
      sorted.sort((a, b) => b.withdrawn_at.localeCompare(a.withdrawn_at))
    }
    return sorted
  }, [members, search, sortKey])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <UserMinus size={18} className="text-gray-400" />
        <div className="text-xs text-gray-400">
          {t('withdrawnCounter', { count: members.length })}
        </div>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />

      <div className="flex items-center gap-2">
        <SortChip active={sortKey === 'withdrawnAt'} onClick={() => setSortKey('withdrawnAt')}>
          {t('sortByWithdrawnAt')}
        </SortChip>
        <SortChip
          active={sortKey === 'participation'}
          onClick={() => setSortKey('participation')}
        >
          {t('sortByParticipation')}
        </SortChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">
          {search ? t('noSearchResult') : t('noWithdrawn')}
        </p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((m) => (
            <WithdrawnRow key={m.discord_id} member={m} />
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
          ? 'bg-gray-500/20 border-gray-500/60 text-gray-200'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function WithdrawnRow({ member }: { member: WithdrawnMemberSummary }) {
  const t = useTranslations('members')

  const formattedWithdrawnAt = new Date(member.withdrawn_at).toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg opacity-80">
      <div className="flex items-center gap-3 px-4 py-3">
        <MemberAvatar discordId={member.discord_id} avatar={member.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-gray-200 text-sm font-semibold flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 flex-shrink-0">
              {t('withdrawnBadge')}
            </span>
            <span className="truncate min-w-0 line-through decoration-gray-600">
              {member.username}
            </span>
            <LanguageBadge locale={member.preferred_language} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-gray-500 text-[11px]">
              {t('withdrawnAt', { date: formattedWithdrawnAt })}
            </span>
            {member.top_roles.map((r) => {
              const style = getRoleStyle(r.role)
              return (
                <span
                  key={r.role}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    style?.badge ?? 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {r.role} {r.count}
                </span>
              )
            })}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-gray-400 font-mono font-semibold text-sm">
            {member.participation_count}
          </p>
          <p className="text-gray-600 text-[10px]">{t('participation')}</p>
        </div>
      </div>
    </li>
  )
}
