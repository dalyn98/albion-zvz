'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronRight, Crown, Users, X } from 'lucide-react'
import { compareStrings } from '@/lib/sort-strings'
import type { DemoMember, DemoMemberRoleKey, DemoWeaponKey } from '@/data/demo-seed'

type Props = {
  members: DemoMember[]
}

type SortKey = 'participation' | 'recent'

export function DemoMembersTable({ members }: Props) {
  const t = useTranslations('members')
  const tDemo = useTranslations('demo')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('participation')
  const [roleFilter, setRoleFilter] = useState<DemoMemberRoleKey | null>(null)
  const [weaponFilter, setWeaponFilter] = useState<DemoWeaponKey | null>(null)

  const totalParticipation = useMemo(
    () => members.reduce((acc, m) => acc + m.weeklyAttendance.attended, 0),
    [members],
  )

  const availableRoles = useMemo(() => {
    const seen = new Set<DemoMemberRoleKey>()
    for (const m of members) seen.add(m.role)
    return (['admin', 'caller', 'member', 'intern'] as const).filter((r) => seen.has(r))
  }, [members])

  const availableWeapons = useMemo(() => {
    const tally = new Map<DemoWeaponKey, number>()
    for (const m of members) {
      tally.set(m.primaryWeapon, (tally.get(m.primaryWeapon) ?? 0) + 1)
    }
    return Array.from(tally.entries())
      .map(([weapon, count]) => ({ weapon, count }))
      .sort((a, b) => b.count - a.count)
  }, [members])

  const hasFilter = !!roleFilter || !!weaponFilter

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = q
      ? members.filter((m) => m.ign.toLowerCase().includes(q))
      : members.slice()
    if (roleFilter) base = base.filter((m) => m.role === roleFilter)
    if (weaponFilter) base = base.filter((m) => m.primaryWeapon === weaponFilter)
    if (sortKey === 'recent') {
      return [...base].sort((a, b) => a.joinedDaysAgo - b.joinedDaysAgo)
    }
    return [...base].sort((a, b) => {
      if (b.weeklyAttendance.attended !== a.weeklyAttendance.attended) {
        return b.weeklyAttendance.attended - a.weeklyAttendance.attended
      }
      return compareStrings(a.ign, b.ign)
    })
  }, [members, search, sortKey, roleFilter, weaponFilter])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <Users size={18} className="text-amber-400" />
        <div className="text-xs text-gray-400">
          {t.rich('counter', {
            memberCount: members.length,
            total: totalParticipation,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-600 focus:border-amber-500/60 focus:outline-none"
      />

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
              const active = roleFilter === role
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(active ? null : role)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                >
                  {tDemo(`roles.${role}`)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {availableWeapons.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
              {t('filterByWeapon')}
            </span>
            {weaponFilter && (
              <button
                type="button"
                onClick={() => setWeaponFilter(null)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <X size={11} />
                {t('filterClear')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableWeapons.map(({ weapon, count }) => {
              const active = weaponFilter === weapon
              return (
                <button
                  key={weapon}
                  type="button"
                  onClick={() => setWeaponFilter(active ? null : weapon)}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
                  }`}
                >
                  <span>{tDemo(`weapons.${weapon}`)}</span>
                  <span className="text-gray-500">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <SortChip
          active={!hasFilter && sortKey === 'participation'}
          disabled={hasFilter}
          onClick={() => setSortKey('participation')}
        >
          {t('sortByParticipation')}
        </SortChip>
        <SortChip
          active={!hasFilter && sortKey === 'recent'}
          disabled={hasFilter}
          onClick={() => setSortKey('recent')}
        >
          {t('sortByRecent')}
        </SortChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((m) => (
            <DemoMemberRow key={m.ign} member={m} />
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

function DemoMemberRow({ member }: { member: DemoMember }) {
  const t = useTranslations('members')
  const tDemo = useTranslations('demo')
  const linkable = member.ign === 'Eternia'
  const isAdmin = member.role === 'admin'

  const content = (
    <div
      className={`flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 transition-colors ${
        linkable ? 'hover:border-amber-500/40' : ''
      }`}
    >
      <DemoAvatar ign={member.ign} />
      <div className="min-w-0 flex-1">
        <div className="text-white text-sm font-semibold flex items-center gap-1.5 min-w-0">
          {isAdmin && (
            <Crown
              size={13}
              className="text-amber-300 flex-shrink-0"
              aria-label={t('adminLabel')}
            />
          )}
          <span className="truncate min-w-0">{member.ign}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
            {tDemo(`roles.${member.role}`)}
          </span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">
            {tDemo(`weapons.${member.primaryWeapon}`)}
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-amber-400 font-mono font-semibold text-sm">
          {member.weeklyAttendance.attended}
        </p>
        <p className="text-gray-500 text-[10px]">{t('participation')}</p>
      </div>
      <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
    </div>
  )

  return (
    <li>
      {linkable ? (
        <Link href={`/demo/members/${member.ign}`} className="block">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  )
}

function DemoAvatar({ ign }: { ign: string }) {
  const initial = ign.charAt(0).toUpperCase()
  return (
    <div
      className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-200"
      aria-hidden
    >
      {initial}
    </div>
  )
}
