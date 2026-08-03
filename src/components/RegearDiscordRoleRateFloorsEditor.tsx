'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronDown, Plus, Save, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  deleteRegearDiscordRoleRateFloor,
  upsertRegearDiscordRoleRateFloor,
  type RegearDiscordRoleRateFloor,
} from '@/app/actions/regear-role-rate-floors'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import { useConfirm } from './ConfirmDialog'
import { EmptyState } from './ui-patterns'

interface Props {
  initialPolicies: RegearDiscordRoleRateFloor[]
}

function parseRate(value: string): number | null {
  const parsed = Number(value.trim())
  return isValidRoleRegearPayoutRate(parsed) ? parsed : null
}

export default function RegearDiscordRoleRateFloorsEditor({
  initialPolicies,
}: Props) {
  const t = useTranslations('adminRegearRoleRateFloors')
  const tCommon = useTranslations('common')
  const confirm = useConfirm()
  const [policies, setPolicies] = useState(initialPolicies)
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [rateInput, setRateInput] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    void (async () => {
      const result = await listGuildRoles()
      if (result.error) {
        setError(result.error)
        return
      }
      setRoles(result.roles)
      setSelectedRoleId(result.roles[0]?.id ?? '')
    })()
  }, [])

  const addPolicy = () => {
    const role = roles?.find((item) => item.id === selectedRoleId)
    const minimumPayoutRatePercent = parseRate(rateInput)
    if (!role) {
      setError(t('roleRequired'))
      return
    }
    if (minimumPayoutRatePercent === null) {
      setError(t('rateInvalid'))
      return
    }
    setError('')
    startTransition(async () => {
      const result = await upsertRegearDiscordRoleRateFloor({
        discordRoleId: role.id,
        discordRoleName: role.name,
        minimumPayoutRatePercent,
      })
      if (!result.policy) {
        setError(result.error ?? t('saveFailed'))
        return
      }
      setPolicies((current) =>
        [...current.filter((item) => item.id !== result.policy!.id), result.policy!].sort(
          (a, b) => b.minimumPayoutRatePercent - a.minimumPayoutRatePercent,
        ),
      )
      setRateInput('')
    })
  }

  return (
    <details className="rounded-xl border border-gray-800 bg-gray-900/70">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('description')}</p>
        </div>
        <ChevronDown size={16} className="shrink-0 text-gray-500" />
      </summary>

      <div className="space-y-4 border-t border-gray-800 px-4 py-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          {t('formulaHint')}
        </div>

        {roles === null ? (
          <p className="text-xs text-gray-500">{t('rolesLoading')}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-400">{t('roleLabel')}</span>
              <select
                value={selectedRoleId}
                onChange={(event) => setSelectedRoleId(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-400">{t('rateLabel')}</span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={rateInput}
                  onChange={(event) => setRateInput(event.target.value)}
                  placeholder={t('ratePlaceholder')}
                  className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-8 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">
                  %
                </span>
              </div>
            </label>
            <button
              type="button"
              onClick={addPolicy}
              disabled={pending || !selectedRoleId || !rateInput.trim()}
              className="mt-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-30"
            >
              <Plus size={13} />
              {pending ? tCommon('saving') : t('add')}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {policies.length === 0 ? (
          <EmptyState icon={Plus} title={t('emptyTitle')} />
        ) : (
          <ul className="space-y-2">
            {policies.map((policy) => (
              <RateFloorRow
                key={policy.id}
                policy={policy}
                roleName={
                  roles?.find((role) => role.id === policy.discordRoleId)?.name ??
                  policy.discordRoleName
                }
                onSaved={(saved) =>
                  setPolicies((current) =>
                    current
                      .map((item) => (item.id === saved.id ? saved : item))
                      .sort(
                        (a, b) =>
                          b.minimumPayoutRatePercent - a.minimumPayoutRatePercent,
                      ),
                  )
                }
                onDelete={async () => {
                  if (
                    !(await confirm({
                      body: t('deleteConfirm', { role: policy.discordRoleName }),
                      destructive: true,
                    }))
                  ) {
                    return
                  }
                  startTransition(async () => {
                    const result = await deleteRegearDiscordRoleRateFloor(policy.id)
                    if (result.error) {
                      setError(result.error)
                      return
                    }
                    setPolicies((current) =>
                      current.filter((item) => item.id !== policy.id),
                    )
                  })
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function RateFloorRow({
  policy,
  roleName,
  onSaved,
  onDelete,
}: {
  policy: RegearDiscordRoleRateFloor
  roleName: string
  onSaved: (policy: RegearDiscordRoleRateFloor) => void
  onDelete: () => void
}) {
  const t = useTranslations('adminRegearRoleRateFloors')
  const tCommon = useTranslations('common')
  const [rateInput, setRateInput] = useState(String(policy.minimumPayoutRatePercent))
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const rate = parseRate(rateInput)

  const save = () => {
    if (rate === null) {
      setError(t('rateInvalid'))
      return
    }
    startTransition(async () => {
      const result = await upsertRegearDiscordRoleRateFloor({
        id: policy.id,
        discordRoleId: policy.discordRoleId,
        discordRoleName: roleName,
        minimumPayoutRatePercent: rate,
      })
      if (!result.policy) {
        setError(result.error ?? t('saveFailed'))
        return
      }
      setError('')
      onSaved(result.policy)
    })
  }

  return (
    <li className="grid items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">@{roleName}</p>
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
          aria-label={t('rateLabel')}
          className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-8 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">
          %
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={save}
          disabled={
            pending ||
            rate === null ||
            rate === policy.minimumPayoutRatePercent
          }
          className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-30"
        >
          <Save size={13} />
          {pending ? tCommon('saving') : tCommon('save')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label={t('delete')}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 md:col-span-3">{error}</p>}
    </li>
  )
}
