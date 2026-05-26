'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { saveBuildSheetPlan } from '@/app/actions/build-sheet'
import {
  BUILD_SHEET_ROLES,
  type BuildSheetPartyAssigner,
  type BuildSheetRole,
  type BuildSheetRoleDemand,
} from '@/lib/build-sheet'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useRegisterSave, useReportDirty } from './EventEditSaveRegistry'

interface MemberDirectoryEntry {
  discord_id: string
  username: string
  eligible: boolean
}

interface Props {
  eventId: string
  demands: BuildSheetRoleDemand[]
  assigners: BuildSheetPartyAssigner[]
  memberDirectory: MemberDirectoryEntry[]
  defaultPartyCount: number
  maxPartyCount: number
}

function demandKey(partyNumber: number, role: BuildSheetRole): string {
  return `${partyNumber}:${role}`
}

function serializePlan(
  demandValues: Record<string, number>,
  assignerValues: Record<number, string>,
): string {
  return JSON.stringify({ demandValues, assignerValues })
}

export default function BuildSheetPlanner({
  eventId,
  demands,
  assigners,
  memberDirectory,
  defaultPartyCount,
  maxPartyCount,
}: Props) {
  const t = useTranslations('buildSheetRecruitment')
  const tRole = useTranslations('slotRole')
  const initialDemands = useMemo(() => {
    const values: Record<string, number> = {}
    for (const demand of demands) {
      values[demandKey(demand.party_number, demand.role_type)] = demand.required_count
    }
    return values
  }, [demands])
  const initialAssigners = useMemo(() => {
    const values: Record<number, string> = {}
    for (const assigner of assigners) {
      values[assigner.party_number] = assigner.caller_discord_id
    }
    return values
  }, [assigners])
  const highestExisting = Math.max(
    defaultPartyCount,
    ...demands.map((d) => d.party_number),
    ...assigners.map((a) => a.party_number),
  )
  const [partyCount, setPartyCount] = useState(Math.min(maxPartyCount, highestExisting))
  const [demandValues, setDemandValues] = useState<Record<string, number>>(initialDemands)
  const [assignerValues, setAssignerValues] = useState<Record<number, string>>(initialAssigners)
  const [cleanSnapshot, setCleanSnapshot] = useState(() =>
    serializePlan(initialDemands, initialAssigners),
  )
  const [error, setError] = useState('')
  const currentSnapshot = serializePlan(demandValues, assignerValues)
  const dirty = currentSnapshot !== cleanSnapshot
  useReportDirty('build-sheet-plan', dirty)

  const partyNumbers = Array.from({ length: partyCount }, (_, i) => i + 1)
  const totalRequired = partyNumbers.reduce(
    (sum, partyNumber) =>
      sum + BUILD_SHEET_ROLES.reduce(
        (roleSum, role) => roleSum + (demandValues[demandKey(partyNumber, role)] ?? 0),
        0,
      ),
    0,
  )

  const updateDemand = (partyNumber: number, role: BuildSheetRole, value: string) => {
    const parsed = Number(value)
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(20, Math.floor(parsed))) : 0
    setDemandValues((prev) => ({ ...prev, [demandKey(partyNumber, role)]: next }))
  }

  const persist = async (): Promise<{ error?: string }> => {
    const nextDemands: BuildSheetRoleDemand[] = []
    for (const partyNumber of partyNumbers) {
      for (const role of BUILD_SHEET_ROLES) {
        nextDemands.push({
          party_number: partyNumber,
          role_type: role,
          required_count: demandValues[demandKey(partyNumber, role)] ?? 0,
        })
      }
    }
    const nextAssigners: BuildSheetPartyAssigner[] = partyNumbers
      .map((partyNumber) => ({
        party_number: partyNumber,
        caller_discord_id: assignerValues[partyNumber]?.trim() ?? '',
      }))
      .filter((row) => row.caller_discord_id.length > 0)
    const result = await saveBuildSheetPlan(eventId, nextDemands, nextAssigners)
    if (result.error) {
      setError(result.error)
      return { error: result.error }
    }
    setError('')
    setCleanSnapshot(currentSnapshot)
    return {}
  }

  useRegisterSave('build-sheet-plan', t('planner.saveLabel'), persist)

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">{t('planner.title')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('planner.description')}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2">
          <p className="text-[10px] text-gray-500 uppercase font-bold">{t('planner.totalRequired')}</p>
          <p className="text-lg font-bold text-amber-300 tabular-nums">{totalRequired}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[820px] w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-800">
              <th className="py-2 pr-3">{t('planner.party')}</th>
              <th className="py-2 px-2 min-w-44">{t('planner.assigner')}</th>
              {BUILD_SHEET_ROLES.map((role) => (
                <th key={role} className="py-2 px-2 text-center">
                  {translateSlotRole(role, tRole)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partyNumbers.map((partyNumber) => (
              <tr key={partyNumber} className="border-b border-gray-800/70">
                <td className="py-2 pr-3 text-white font-bold">
                  {t('partyNumber', { number: partyNumber })}
                </td>
                <td className="py-2 px-2">
                  <select
                    value={assignerValues[partyNumber] ?? ''}
                    onChange={(e) =>
                      setAssignerValues((prev) => ({ ...prev, [partyNumber]: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">{t('planner.noAssigner')}</option>
                    {memberDirectory.map((member) => (
                      <option key={member.discord_id} value={member.discord_id}>
                        {member.eligible
                          ? member.username
                          : t('planner.staleAssigner', { name: member.username })}
                      </option>
                    ))}
                  </select>
                </td>
                {BUILD_SHEET_ROLES.map((role) => (
                  <td key={role} className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={demandValues[demandKey(partyNumber, role)] ?? 0}
                      onChange={(e) => updateDemand(partyNumber, role, e.target.value)}
                      className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-center text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {partyCount < maxPartyCount && (
        <button
          type="button"
          onClick={() => setPartyCount((count) => Math.min(maxPartyCount, count + 1))}
          className="inline-flex items-center gap-1 text-sm font-semibold text-amber-400 hover:text-amber-300"
        >
          <Plus size={14} />
          {t('planner.addParty')}
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
    </section>
  )
}
