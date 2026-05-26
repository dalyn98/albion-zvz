'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, RotateCcw, Search } from 'lucide-react'
import {
  summarizeBuildSheetRoles,
  summarizeBuildSheetWeapons,
  type BuildSheetApplication,
  type BuildSheetRole,
  type BuildSheetRoleDemand,
} from '@/lib/build-sheet'
import { assignBuildSheetApplication, unassignBuildSheetApplication } from '@/app/actions/build-sheet'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'

interface Props {
  eventId: string
  demands: BuildSheetRoleDemand[]
  applications: BuildSheetApplication[]
  canManageAll: boolean
  manageablePartyNumbers: number[]
}

export default function BuildSheetAssignmentBoard({
  eventId,
  demands,
  applications,
  canManageAll,
  manageablePartyNumbers,
}: Props) {
  const t = useTranslations('buildSheetRecruitment')
  const tRole = useTranslations('slotRole')
  const [roleFilter, setRoleFilter] = useState<BuildSheetRole | 'all'>('all')
  const [weaponFilter, setWeaponFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const allPartyNumbers = useMemo(() => {
    const set = new Set<number>([
      ...demands.map((d) => d.party_number),
      ...applications
        .map((app) => app.assigned_party_number)
        .filter((v): v is number => typeof v === 'number'),
    ])
    const numbers = Array.from(set).sort((a, b) => a - b)
    return numbers.length > 0 ? numbers : [1]
  }, [applications, demands])
  const selectableParties = canManageAll ? allPartyNumbers : manageablePartyNumbers
  const [selectedParty, setSelectedParty] = useState<number>(selectableParties[0] ?? 1)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const roleSummary = summarizeBuildSheetRoles(demands, applications)
  const weaponSummary = summarizeBuildSheetWeapons(applications)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleApplications = applications.filter((app) => {
    if (roleFilter !== 'all' && app.role_type !== roleFilter) return false
    if (weaponFilter && !app.preferences.some((pref) => pref.template_id === weaponFilter)) {
      return false
    }
    if (!normalizedQuery) return true
    return (
      app.applicant_username.toLowerCase().includes(normalizedQuery) ||
      app.preferences.some((pref) => pref.weapon_name.toLowerCase().includes(normalizedQuery))
    )
  })

  const canManageParty = (partyNumber: number | null): boolean => {
    if (!partyNumber) return false
    return canManageAll || manageablePartyNumbers.includes(partyNumber)
  }

  const runAssign = (app: BuildSheetApplication, templateId: string) => {
    setError('')
    setPendingId(app.id)
    startTransition(async () => {
      const result = await assignBuildSheetApplication({
        eventId,
        applicationId: app.id,
        partyNumber: selectedParty,
        templateId,
      })
      setPendingId(null)
      if (result.error) setError(result.error)
    })
  }

  const runUnassign = (app: BuildSheetApplication) => {
    setError('')
    setPendingId(app.id)
    startTransition(async () => {
      const result = await unassignBuildSheetApplication(eventId, app.id)
      setPendingId(null)
      if (result.error) setError(result.error)
    })
  }

  if (!canManageAll && manageablePartyNumbers.length === 0) return null

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase text-sky-300">{t('board.eyebrow')}</p>
          <h2 className="mt-1 text-lg font-bold text-white">{t('board.title')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('board.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-400" htmlFor="build-sheet-party">
            {t('board.assignTo')}
          </label>
          <select
            id="build-sheet-party"
            value={selectedParty}
            onChange={(e) => setSelectedParty(Number(e.target.value))}
            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm font-bold text-white focus:border-sky-400 focus:outline-none"
          >
            {selectableParties.map((partyNumber) => (
              <option key={partyNumber} value={partyNumber}>
                {t('partyNumber', { number: partyNumber })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {roleSummary.map((role) => (
          <button
            key={role.role_type}
            type="button"
            onClick={() => {
              setRoleFilter(role.role_type)
              setWeaponFilter(null)
            }}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              roleFilter === role.role_type
                ? 'border-sky-400/70 bg-sky-400/15'
                : 'border-gray-800 bg-gray-950 hover:border-gray-700'
            }`}
          >
            <span className="block text-sm font-bold text-white">
              {translateSlotRole(role.role_type, tRole)}
            </span>
            <span className="mt-1 block text-[11px] text-gray-400">
              {t('board.roleSummary', {
                required: role.required_count,
                pending: role.pending_count,
                assigned: role.assigned_count,
              })}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-4 items-start">
        <aside className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setRoleFilter('all')
              setWeaponFilter(null)
            }}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-bold transition-colors ${
              roleFilter === 'all' && !weaponFilter
                ? 'border-sky-400/70 bg-sky-400/15 text-sky-100'
                : 'border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-700'
            }`}
          >
            {t('board.allWeapons')}
          </button>
          <div className="max-h-[28rem] overflow-y-auto space-y-2 pr-1">
            {weaponSummary.map((weapon) => (
              <button
                key={`${weapon.role_type}:${weapon.template_id}`}
                type="button"
                onClick={() => {
                  setRoleFilter(weapon.role_type)
                  setWeaponFilter(weapon.template_id)
                }}
                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                  weaponFilter === weapon.template_id
                    ? 'border-sky-400/70 bg-sky-400/15'
                    : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ItemImage itemId={weapon.weapon_id} itemName={weapon.weapon_name} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-white">
                      {weapon.weapon_name}
                    </span>
                    <span className="block text-[10px] text-gray-500">
                      {translateSlotRole(weapon.role_type, tRole)}
                    </span>
                  </span>
                </span>
                <span className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-bold">
                  {weapon.priority_counts.map((count, index) => (
                    <span key={index} className="rounded bg-gray-800 px-1.5 py-1 text-center text-gray-300">
                      {t('board.priorityCount', { priority: index + 1, count })}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-3 min-w-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('board.searchPlaceholder')}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-gray-950 text-left text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t('board.member')}</th>
                  <th className="px-3 py-2">{t('board.role')}</th>
                  <th className="px-3 py-2">{t('board.preferences')}</th>
                  <th className="px-3 py-2">{t('board.status')}</th>
                  <th className="px-3 py-2 text-right">{t('board.action')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleApplications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                      {t('board.empty')}
                    </td>
                  </tr>
                ) : (
                  visibleApplications.map((app) => (
                    <tr key={app.id} className="border-t border-gray-800">
                      <td className="px-3 py-2 font-bold text-white">{app.applicant_username}</td>
                      <td className="px-3 py-2 text-gray-300">
                        {translateSlotRole(app.role_type, tRole)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {app.preferences.map((pref) => (
                            <button
                              key={pref.template_id}
                              type="button"
                              onClick={() => app.status === 'pending' && runAssign(app, pref.template_id)}
                              disabled={
                                app.status !== 'pending' ||
                                !canManageParty(selectedParty) ||
                                isPending
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800 px-2 py-1 text-xs font-semibold text-gray-200 hover:border-sky-400/60 disabled:opacity-45"
                              title={t('board.assignPreference')}
                            >
                              <span className="text-sky-300">{pref.priority}</span>
                              {pref.weapon_name}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {app.status === 'assigned' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">
                            <CheckCircle2 size={12} />
                            {t('board.assignedTo', { party: app.assigned_party_number ?? '-' })}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
                            {t('board.pending')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {app.status === 'assigned' && canManageParty(app.assigned_party_number) && (
                          <button
                            type="button"
                            onClick={() => runUnassign(app)}
                            disabled={isPending && pendingId === app.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                          >
                            <RotateCcw size={12} />
                            {t('board.unassign')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
    </section>
  )
}
