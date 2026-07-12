'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  updateEventRegearRoleOverrides,
  type EventRegearRoleOverridePayload,
} from '@/app/actions/event-regear-policy'
import { useRegisterSave, useReportDirty } from './EventEditSaveRegistry'
import {
  EVENT_REGEAR_PAYOUT_RATE_MAX,
  EVENT_REGEAR_PAYOUT_RATE_MIN,
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  isValidEventRegearPayoutRate,
  isValidEventRegearSilverCap,
} from '@/lib/regear-event-policy'

export interface EventRegearRoleRewardRow {
  roleName: string
  silver: number
  payoutRatePercent: number | null
}

export interface EventRegearRoleOverrideRow {
  roleName: string
  enabled: boolean
  silverCap: number | null
  payoutRatePercent: number | null
}

interface EditableRow {
  roleName: string
  defaultSilver: number
  defaultPayoutRatePercent: number | null
  enabled: boolean
  silverCap: string
  payoutRatePercent: string
}

interface Props {
  eventId: string
  roleRewards: EventRegearRoleRewardRow[]
  overrides: EventRegearRoleOverrideRow[]
  canManage: boolean
}

function rowSnapshot(rows: EditableRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      roleName: row.roleName,
      enabled: row.enabled,
      silverCap: row.silverCap.trim(),
      payoutRatePercent: row.payoutRatePercent.trim(),
    })),
  )
}

function formatNumber(value: number | null): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

export default function EventRegearRoleOverridesPanel({
  eventId,
  roleRewards,
  overrides,
  canManage,
}: Props) {
  const t = useTranslations('eventRegearRoleOverrides')
  const overrideByRole = useMemo(() => {
    const map = new Map<string, EventRegearRoleOverrideRow>()
    for (const row of overrides) map.set(row.roleName, row)
    return map
  }, [overrides])
  const initialRows = useMemo<EditableRow[]>(
    () =>
      roleRewards.map((reward) => {
        const override = overrideByRole.get(reward.roleName)
        return {
          roleName: reward.roleName,
          defaultSilver: reward.silver,
          defaultPayoutRatePercent: reward.payoutRatePercent,
          enabled: override?.enabled ?? true,
          silverCap: override?.silverCap != null ? String(override.silverCap) : '',
          payoutRatePercent:
            override?.payoutRatePercent != null ? String(override.payoutRatePercent) : '',
        }
      }),
    [overrideByRole, roleRewards],
  )
  const [rows, setRows] = useState<EditableRow[]>(initialRows)
  const [cleanSnapshot, setCleanSnapshot] = useState(() => rowSnapshot(initialRows))
  const [error, setError] = useState('')
  const currentSnapshot = rowSnapshot(rows)
  const isDirty = canManage && currentSnapshot !== cleanSnapshot

  useReportDirty('event-regear-role-overrides', isDirty)
  useRegisterSave(
    'event-regear-role-overrides',
    t('sectionTitle'),
    async () => {
      const payload: EventRegearRoleOverridePayload[] = []
      for (const row of rows) {
        const silverRaw = row.silverCap.trim()
        const rateRaw = row.payoutRatePercent.trim()
        let silverCap: number | null = null
        let payoutRatePercent: number | null = null
        if (silverRaw) {
          const parsed = Number(silverRaw)
          if (!isValidEventRegearSilverCap(parsed)) {
            const message = t('silverCapInvalid', {
              role: row.roleName,
              min: EVENT_REGEAR_SILVER_CAP_MIN,
              max: EVENT_REGEAR_SILVER_CAP_MAX,
            })
            setError(message)
            return { error: message }
          }
          silverCap = parsed
        }
        if (rateRaw) {
          const parsed = Number(rateRaw)
          if (!isValidEventRegearPayoutRate(parsed)) {
            const message = t('payoutRateInvalid', {
              role: row.roleName,
              min: EVENT_REGEAR_PAYOUT_RATE_MIN,
              max: EVENT_REGEAR_PAYOUT_RATE_MAX,
            })
            setError(message)
            return { error: message }
          }
          payoutRatePercent = parsed
        }
        payload.push({
          roleName: row.roleName,
          enabled: row.enabled,
          silverCap,
          payoutRatePercent,
        })
      }
      const result = await updateEventRegearRoleOverrides(eventId, payload)
      if (result.error) {
        setError(result.error)
        return { error: result.error }
      }
      setError('')
      setCleanSnapshot(rowSnapshot(rows))
      return {}
    },
    canManage,
  )

  if (!canManage || roleRewards.length === 0) return null

  const updateRow = (roleName: string, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.roleName === roleName ? { ...row, ...patch } : row)),
    )
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('sectionTitle')}</h2>
        <p className="mt-1 text-xs text-gray-400">{t('sectionHint')}</p>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => {
          const capInputId = `event-regear-cap-${row.roleName}`
          const rateInputId = `event-regear-rate-${row.roleName}`
          return (
            <article
              key={row.roleName}
              className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-100">{row.roleName}</h3>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                    <div>
                      <dt className="text-gray-500">{t('defaultCapColumn')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-300">
                        {formatNumber(row.defaultSilver)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('defaultRateColumn')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-300">
                        {row.defaultPayoutRatePercent == null
                          ? t('guildDefaultRate')
                          : `${row.defaultPayoutRatePercent}%`}
                      </dd>
                    </div>
                  </dl>
                </div>
                <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-gray-300">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(row.roleName, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-amber-500 focus:ring-amber-500"
                    aria-label={t('enabledAria', { role: row.roleName })}
                  />
                  {t('enabledColumn')}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label htmlFor={capInputId} className="space-y-1">
                  <span className="block text-xs font-semibold text-gray-400">{t('eventCapColumn')}</span>
                  <input
                    id={capInputId}
                    type="number"
                    inputMode="numeric"
                    min={EVENT_REGEAR_SILVER_CAP_MIN}
                    max={EVENT_REGEAR_SILVER_CAP_MAX}
                    disabled={!row.enabled}
                    value={row.silverCap}
                    onChange={(e) => updateRow(row.roleName, { silverCap: e.target.value })}
                    placeholder={t('inheritCapPlaceholder')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </label>
                <label htmlFor={rateInputId} className="space-y-1">
                  <span className="block text-xs font-semibold text-gray-400">{t('eventRateColumn')}</span>
                  <input
                    id={rateInputId}
                    type="number"
                    inputMode="numeric"
                    min={EVENT_REGEAR_PAYOUT_RATE_MIN}
                    max={EVENT_REGEAR_PAYOUT_RATE_MAX}
                    disabled={!row.enabled}
                    value={row.payoutRatePercent}
                    onChange={(e) => updateRow(row.roleName, { payoutRatePercent: e.target.value })}
                    placeholder={t('inheritRatePlaceholder')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </label>
              </div>
            </article>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-gray-500">
            <tr className="border-b border-gray-800">
              <th className="py-2 pr-3 text-left font-semibold">{t('roleColumn')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('defaultCapColumn')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('defaultRateColumn')}</th>
              <th className="px-3 py-2 text-center font-semibold">{t('enabledColumn')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('eventCapColumn')}</th>
              <th className="pl-3 py-2 text-left font-semibold">{t('eventRateColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.roleName} className="border-b border-gray-800/70 last:border-0">
                <td className="py-2 pr-3 font-semibold text-gray-100">{row.roleName}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">
                  {formatNumber(row.defaultSilver)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">
                  {row.defaultPayoutRatePercent == null ? t('guildDefaultRate') : `${row.defaultPayoutRatePercent}%`}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(row.roleName, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-amber-500 focus:ring-amber-500"
                    aria-label={t('enabledAria', { role: row.roleName })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={EVENT_REGEAR_SILVER_CAP_MIN}
                    max={EVENT_REGEAR_SILVER_CAP_MAX}
                    disabled={!row.enabled}
                    value={row.silverCap}
                    onChange={(e) => updateRow(row.roleName, { silverCap: e.target.value })}
                    placeholder={t('inheritCapPlaceholder')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </td>
                <td className="pl-3 py-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={EVENT_REGEAR_PAYOUT_RATE_MIN}
                    max={EVENT_REGEAR_PAYOUT_RATE_MAX}
                    disabled={!row.enabled}
                    value={row.payoutRatePercent}
                    onChange={(e) => updateRow(row.roleName, { payoutRatePercent: e.target.value })}
                    placeholder={t('inheritRatePlaceholder')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  )
}
