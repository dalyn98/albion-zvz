'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, LogIn, X } from 'lucide-react'
import {
  BUILD_SHEET_ROLES,
  MAX_BUILD_SHEET_PREFERENCES,
  type BuildSheetApplication,
  type BuildSheetEntry,
  type BuildSheetRole,
  type BuildSheetRoleDemand,
} from '@/lib/build-sheet'
import { cancelBuildSheetApplication, submitBuildSheetApplication } from '@/app/actions/build-sheet'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'

interface Props {
  eventId: string
  entries: BuildSheetEntry[]
  demands: BuildSheetRoleDemand[]
  myApplication: BuildSheetApplication | null
  canApply: boolean
  loginHref: string
}

export default function BuildSheetApplicationPanel({
  eventId,
  entries,
  demands,
  myApplication,
  canApply,
  loginHref,
}: Props) {
  const t = useTranslations('buildSheetRecruitment')
  const tRole = useTranslations('slotRole')
  const rolesWithEntries = BUILD_SHEET_ROLES.filter((role) =>
    entries.some((entry) => entry.role_type === role),
  )
  const initialRole = myApplication?.role_type ?? rolesWithEntries[0] ?? 'EngageDps'
  const [role, setRole] = useState<BuildSheetRole>(initialRole)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    myApplication?.preferences.map((pref) => pref.template_id) ?? [],
  )
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const roleEntries = useMemo(
    () => entries.filter((entry) => entry.role_type === role),
    [entries, role],
  )
  const demandByRole = useMemo(() => {
    const map = new Map<BuildSheetRole, number>()
    for (const demand of demands) {
      map.set(demand.role_type, (map.get(demand.role_type) ?? 0) + demand.required_count)
    }
    return map
  }, [demands])
  const isAssigned = myApplication?.status === 'assigned'
  const disabled = pending || isAssigned

  const toggleEntry = (id: string) => {
    if (disabled) return
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id)
      if (prev.length >= MAX_BUILD_SHEET_PREFERENCES) return prev
      return [...prev, id]
    })
  }

  const selectRole = (nextRole: BuildSheetRole) => {
    if (disabled) return
    setRole(nextRole)
    setSelectedIds([])
  }

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await submitBuildSheetApplication(eventId, role, selectedIds)
      if (result.error) setError(result.error)
    })
  }

  const cancel = () => {
    setError('')
    startTransition(async () => {
      const result = await cancelBuildSheetApplication(eventId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase text-amber-400">{t('application.eyebrow')}</p>
          <h2 className="mt-1 text-lg font-bold text-white">{t('application.title')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('application.description')}</p>
        </div>
        {!canApply && (
          <Link
            href={loginHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400"
          >
            <LogIn size={14} />
            {t('application.login')}
          </Link>
        )}
      </div>

      {myApplication && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <p className="text-sm font-bold text-emerald-200">
            {isAssigned
              ? t('application.assignedStatus', {
                  party: myApplication.assigned_party_number ?? '-',
                })
              : t('application.pendingStatus')}
          </p>
          <p className="mt-1 text-xs text-emerald-100/80">
            {myApplication.preferences
              .map((pref) => `${pref.priority}. ${pref.weapon_name}`)
              .join(' / ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {BUILD_SHEET_ROLES.map((candidate) => {
          const hasEntries = entries.some((entry) => entry.role_type === candidate)
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => selectRole(candidate)}
              disabled={!hasEntries || disabled}
              className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                role === candidate
                  ? 'border-amber-500 bg-amber-500/15 text-amber-100'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="block text-sm font-bold">{translateSlotRole(candidate, tRole)}</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                {t('application.roleDemand', { count: demandByRole.get(candidate) ?? 0 })}
              </span>
            </button>
          )
        })}
      </div>

      {roleEntries.length === 0 ? (
        <p className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-6 text-center text-sm text-gray-500">
          {t('application.noBuilds')}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {roleEntries.map((entry) => {
            const selectedIndex = selectedIds.indexOf(entry.id)
            const selected = selectedIndex >= 0
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => toggleEntry(entry.id)}
                disabled={disabled || (!selected && selectedIds.length >= MAX_BUILD_SHEET_PREFERENCES)}
                className={`flex items-center gap-3 rounded-lg border p-2 text-left transition-colors disabled:opacity-45 ${
                  selected
                    ? 'border-amber-500/70 bg-amber-500/15'
                    : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                }`}
              >
                <ItemImage itemId={entry.weapon_id} itemName={entry.weapon_name} size={42} hoverPreview />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{entry.weapon_name}</span>
                  <span className="block truncate text-[11px] text-gray-500">{entry.name}</span>
                </span>
                {selected && (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-black">
                    {selectedIndex + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          {t('application.preferenceHint', {
            count: selectedIds.length,
            max: MAX_BUILD_SHEET_PREFERENCES,
          })}
        </p>
        <div className="flex items-center gap-2">
          {myApplication && !isAssigned && (
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              <X size={14} />
              {t('application.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canApply || disabled || selectedIds.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
          >
            <Check size={14} />
            {pending ? t('application.submitting') : t('application.submit')}
          </button>
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
