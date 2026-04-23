'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Crown, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { SLOT_ROLES, getRoleStyle, type SlotRole } from '@/types'
import type { GuildMemberSummary } from '@/app/actions/members-admin'

interface Props {
  members: GuildMemberSummary[]
}

type SortKey = 'participation' | 'recent'
const BADGE_LIMIT = 3

export default function GuildMemberList({ members }: Props) {
  const t = useTranslations('members')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('participation')
  const [roleFilter, setRoleFilter] = useState<SlotRole | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    let base = q ? members.filter((m) => matchesName(m.username, q)) : members
    if (roleFilter) {
      base = base.filter((m) =>
        m.top_roles.some((r) => r.role === roleFilter && r.count > 0),
      )
    }
    const sorted = [...base]
    if (roleFilter) {
      // With a role filter active, sort by that role's count desc — the user's
      // request was "역할군 참여 높은순". Fall through to general participation
      // on ties so members with identical role counts order deterministically.
      sorted.sort((a, b) => {
        const countA = a.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
        const countB = b.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
        if (countB !== countA) return countB - countA
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return a.username.localeCompare(b.username)
      })
    } else if (sortKey === 'recent') {
      sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    } else {
      sorted.sort((a, b) => {
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return a.username.localeCompare(b.username)
      })
    }
    return sorted
  }, [members, search, sortKey, roleFilter])

  const totalParticipations = useMemo(
    () => members.reduce((acc, m) => acc + m.participation_count, 0),
    [members],
  )

  // Only show role chips that actually have any member participating — avoids
  // a row of dead chips for roles no one has played yet.
  const availableRoles = useMemo(() => {
    const seen = new Set<string>()
    for (const m of members) {
      for (const r of m.top_roles) {
        if (r.count > 0) seen.add(r.role)
      }
    }
    return SLOT_ROLES.filter((r) => seen.has(r))
  }, [members])

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

      {availableRoles.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
              {t('filterByRole')}
            </span>
            {roleFilter && (
              <button
                type="button"
                onClick={() => setRoleFilter(null)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <X size={11} />
                {t('filterClear')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableRoles.map((role) => {
              const style = getRoleStyle(role)
              const active = roleFilter === role
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(active ? null : role)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? style?.badge ?? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                >
                  {role}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <SortChip
          active={!roleFilter && sortKey === 'participation'}
          disabled={!!roleFilter}
          onClick={() => setSortKey('participation')}
        >
          {t('sortByParticipation')}
        </SortChip>
        <SortChip
          active={!roleFilter && sortKey === 'recent'}
          disabled={!!roleFilter}
          onClick={() => setSortKey('recent')}
        >
          {t('sortByRecent')}
        </SortChip>
        {roleFilter && (
          <span className="text-[11px] text-amber-300/80">
            {t('sortByRoleActive', { role: roleFilter })}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((m) => (
            <MemberRow key={m.discord_id} member={m} roleFilter={roleFilter} />
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
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
          : disabled
            ? 'bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function MemberRow({
  member,
  roleFilter,
}: {
  member: GuildMemberSummary
  roleFilter: SlotRole | null
}) {
  const t = useTranslations('members')
  // When a role filter is active, surface that role's badge first even if it's
  // outside the member's top N — so the user can see exactly what matched.
  const badges = useMemo(() => {
    if (!roleFilter) return member.top_roles.slice(0, BADGE_LIMIT)
    const match = member.top_roles.find((r) => r.role === roleFilter)
    if (!match) return member.top_roles.slice(0, BADGE_LIMIT)
    const rest = member.top_roles.filter((r) => r.role !== roleFilter).slice(0, BADGE_LIMIT - 1)
    return [match, ...rest]
  }, [member.top_roles, roleFilter])

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
            {badges.length === 0 ? (
              <span className="text-gray-500 text-[11px]">{t('noParticipationHistory')}</span>
            ) : (
              badges.map((r) => {
                const style = getRoleStyle(r.role)
                const isMatched = roleFilter === r.role
                return (
                  <span
                    key={r.role}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      style?.badge ?? 'bg-gray-700 text-gray-300'
                    } ${isMatched ? 'ring-1 ring-amber-300/60' : ''}`}
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
        </div>
        <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
      </Link>
    </li>
  )
}
