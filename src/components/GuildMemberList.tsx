'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Crown, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { getRoleStyle } from '@/types'
import type { GuildMemberSummary } from '@/app/actions/members-admin'

interface Props {
  members: GuildMemberSummary[]
}

type SortKey = 'participation' | 'recent' | 'attendance'

export default function GuildMemberList({ members }: Props) {
  const t = useTranslations('members')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('participation')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    const base = q ? members.filter((m) => matchesName(m.username, q)) : members
    const sorted = [...base]
    if (sortKey === 'recent') {
      sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    } else if (sortKey === 'attendance') {
      // Members with no decidable events (everything upcoming) sort to the
      // bottom — a NULL rate isn't comparable so we fall back to
      // participation count then name.
      sorted.sort((a, b) => {
        const ar = a.attendance_rate
        const br = b.attendance_rate
        if (ar === null && br === null) {
          if (b.participation_count !== a.participation_count) {
            return b.participation_count - a.participation_count
          }
          return a.username.localeCompare(b.username)
        }
        if (ar === null) return 1
        if (br === null) return -1
        if (br !== ar) return br - ar
        return a.username.localeCompare(b.username)
      })
    } else {
      sorted.sort((a, b) => {
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return a.username.localeCompare(b.username)
      })
    }
    return sorted
  }, [members, search, sortKey])

  const totalParticipations = useMemo(
    () => members.reduce((acc, m) => acc + m.participation_count, 0),
    [members],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <Users size={18} className="text-amber-400" />
        <div className="text-xs text-gray-400">
          {t.rich('counter', {
            memberCount: members.length,
            total: totalParticipations,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </div>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />

      <div className="flex items-center gap-2 flex-wrap">
        <SortChip active={sortKey === 'participation'} onClick={() => setSortKey('participation')}>
          {t('sortByParticipation')}
        </SortChip>
        <SortChip active={sortKey === 'attendance'} onClick={() => setSortKey('attendance')}>
          {t('sortByAttendance')}
        </SortChip>
        <SortChip active={sortKey === 'recent'} onClick={() => setSortKey('recent')}>
          {t('sortByRecent')}
        </SortChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((m) => (
            <MemberRow key={m.discord_id} member={m} />
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
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function MemberRow({ member }: { member: GuildMemberSummary }) {
  const t = useTranslations('members')
  return (
    <li>
      <Link
        href={`/members/${member.discord_id}`}
        className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-3 transition-colors"
      >
        <MemberAvatar discordId={member.discord_id} avatar={member.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-white text-sm font-semibold flex items-center gap-1.5 min-w-0">
            {member.is_admin && (
              <Crown
                size={13}
                className="text-amber-300 flex-shrink-0"
                aria-label={t('adminLabel')}
              />
            )}
            <span className="truncate min-w-0">{member.username}</span>
            <LanguageBadge locale={member.preferred_language} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {member.top_roles.length === 0 ? (
              <span className="text-gray-500 text-[11px]">{t('noParticipationHistory')}</span>
            ) : (
              member.top_roles.map((r) => {
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
              })
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-amber-400 font-mono font-semibold text-sm">{member.participation_count}</p>
          <p className="text-gray-500 text-[10px]">{t('participation')}</p>
          {member.attendance_rate !== null && (
            <p
              className={`text-[10px] font-mono mt-0.5 ${
                member.attendance_rate >= 80
                  ? 'text-emerald-400'
                  : member.attendance_rate >= 50
                    ? 'text-amber-300'
                    : 'text-rose-300'
              }`}
              title={t('attendanceFraction', {
                attended: member.attended_count,
                total: member.decidable_count,
              })}
            >
              {t('attendancePercent', { rate: member.attendance_rate })}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
      </Link>
    </li>
  )
}
