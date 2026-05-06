'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { DemoMember } from '@/data/demo-seed'

type Props = {
  members: DemoMember[]
}

export function DemoMembersTable({ members }: Props) {
  const t = useTranslations('demo')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const role = t(`roles.${m.role}`).toLowerCase()
      return m.ign.toLowerCase().includes(q) || role.includes(q)
    })
  }, [query, members, t])

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('members.searchPlaceholder')}
        className="w-full sm:max-w-sm bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-amber-500/60 focus:outline-none"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-950 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">{t('members.colName')}</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">{t('members.colRole')}</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">{t('members.colWeapon')}</th>
                <th className="text-right px-3 py-2 hidden lg:table-cell">{t('members.colPoints')}</th>
                <th className="text-right px-3 py-2">{t('members.colKd')}</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">{t('members.colBattles')}</th>
                <th className="text-right px-3 py-2 hidden sm:table-cell">{t('members.colSurvival')}</th>
                <th className="text-right px-3 py-2 pr-4">{t('members.colAttend')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-600">
                    {t('members.emptySearch')}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => <MemberRow key={m.ign} member={m} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MemberRow({ member: m }: { member: DemoMember }) {
  const t = useTranslations('demo')
  const linkable = m.ign === 'Eternia'
  const kd = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : '∞'
  const cells = (
    <>
      <td className="px-3 py-2.5">
        <div className="font-semibold text-white">{m.ign}</div>
        <div className="text-[10px] text-gray-500 sm:hidden mt-0.5">
          {t(`roles.${m.role}`)} · {t(`weapons.${m.primaryWeapon}`)}
        </div>
      </td>
      <td className="px-3 py-2.5 hidden sm:table-cell text-gray-300">{t(`roles.${m.role}`)}</td>
      <td className="px-3 py-2.5 hidden md:table-cell text-gray-400">
        {t(`weapons.${m.primaryWeapon}`)}
      </td>
      <td className="px-3 py-2.5 hidden lg:table-cell text-right font-mono text-amber-400">
        {m.points.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-gray-200 whitespace-nowrap">
        {m.kills}/{m.deaths}{' '}
        <span className="text-[10px] text-gray-500">({kd})</span>
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell text-right font-mono text-gray-300">
        {m.battles}
      </td>
      <td className="px-3 py-2.5 hidden sm:table-cell text-right font-mono text-emerald-400">
        {m.survivalPct}%
      </td>
      <td className="px-3 py-2.5 pr-4 text-right font-mono text-gray-300">
        {t('members.fractionAttend', {
          a: m.weeklyAttendance.attended,
          b: m.weeklyAttendance.total,
        })}
      </td>
    </>
  )

  if (!linkable) {
    return <tr className="text-gray-200">{cells}</tr>
  }
  return (
    <tr className="text-gray-200 hover:bg-gray-800/40 transition-colors cursor-pointer">
      <td colSpan={8} className="p-0">
        <Link href={`/demo/members/${m.ign}`} className="block">
          <table className="w-full text-xs">
            <tbody>
              <tr>{cells}</tr>
            </tbody>
          </table>
        </Link>
      </td>
    </tr>
  )
}
