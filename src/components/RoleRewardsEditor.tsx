'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Save, Trash2 } from 'lucide-react'
import {
  deleteRoleReward,
  updateRoleReward,
  type RoleReward,
} from '@/app/actions/regear-admin'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useReportDirty } from './UnsavedChangesProvider'
import { EmptyState } from '@/components/ui-patterns'

export default function RoleRewardsEditor({ rewards }: { rewards: RoleReward[] }) {
  const resetKey = useMemo(
    () =>
      rewards
        .map((reward) =>
          [
            reward.role_name,
            reward.silver,
            reward.payout_rate_percent ?? '',
            reward.updated_at,
          ].join(':'),
        )
        .join('|'),
    [rewards],
  )

  return <RoleRewardsEditorInner key={resetKey} rewards={rewards} />
}

function RoleRewardsEditorInner({ rewards }: { rewards: RoleReward[] }) {
  const t = useTranslations('adminRoleRewards')
  const [items, setItems] = useState(rewards)

  return (
    <div className="space-y-3">
      <NewRoleRewardRow
        onCreated={(reward) => {
          setItems((prev) => {
            const withoutSameRole = prev.filter((item) => item.role_name !== reward.role_name)
            return [...withoutSameRole, reward].sort((a, b) => a.role_name.localeCompare(b.role_name))
          })
        }}
      />
      {items.length === 0 ? (
        <EmptyState icon={Save} title={t('noRoles')} />
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <RoleRow
              key={r.role_name}
              reward={r}
              onDeleted={(roleName) => {
                setItems((prev) => prev.filter((item) => item.role_name !== roleName))
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function parsePayoutRateInput(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return 'invalid'
  return parsed
}

function normalizeRoleNameInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function NewRoleRewardRow({
  onCreated,
}: {
  onCreated: (reward: RoleReward) => void
}) {
  const t = useTranslations('adminRoleRewards')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [roleName, setRoleName] = useState('')
  const [silverInput, setSilverInput] = useState('')
  const [rateInput, setRateInput] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const normalizedRoleName = normalizeRoleNameInput(roleName)
  const parsedSilver = parseSilverInput(silverInput)
  const parsedRate = parsePayoutRateInput(rateInput)
  const dirty = Boolean(roleName.trim() || silverInput.trim() || rateInput.trim())
  useReportDirty('role-reward:new', dirty)

  const save = () => {
    if (!normalizedRoleName) {
      setError(t('roleNameRequired'))
      return
    }
    if (parsedSilver === null) {
      setError(t('numberOnly'))
      return
    }
    if (parsedRate === 'invalid') {
      setError(t('rateInvalid'))
      return
    }
    setError('')
    startTransition(async () => {
      const result = await updateRoleReward(normalizedRoleName, parsedSilver, parsedRate)
      if (result.error) {
        setError(result.error)
        return
      }
      onCreated({
        role_name: normalizedRoleName,
        silver: parsedSilver,
        payout_rate_percent: parsedRate,
        updated_at: new Date().toISOString(),
      })
      setRoleName('')
      setSilverInput('')
      setRateInput('')
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_140px_auto] gap-2 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <input
        type="text"
        value={roleName}
        onChange={(e) => {
          setRoleName(e.target.value)
          setError('')
        }}
        placeholder={t('roleNamePlaceholder')}
        aria-label={t('roleNameLabel')}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
      />
      <input
        type="text"
        inputMode="numeric"
        value={silverInput}
        onChange={(e) => {
          setSilverInput(e.target.value)
          setError('')
        }}
        placeholder={t('silverPlaceholder')}
        aria-label={t('silverLabel')}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
      />
      <input
        type="text"
        inputMode="numeric"
        value={rateInput}
        onChange={(e) => {
          setRateInput(e.target.value)
          setError('')
        }}
        placeholder={t('ratePlaceholder')}
        aria-label={t('rateLabel')}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black text-xs font-bold px-3 py-2 rounded-lg"
      >
        <Plus size={13} />
        {pending ? tCommon('saving') : t('addRole')}
      </button>
      {error && <p className="md:col-span-4 text-red-400 text-xs">{error}</p>}
    </div>
  )
}

function RoleRow({
  reward,
  onDeleted,
}: {
  reward: RoleReward
  onDeleted: (roleName: string) => void
}) {
  const t = useTranslations('adminRoleRewards')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const [value, setValue] = useState(reward.silver.toString())
  const [rateValue, setRateValue] = useState(reward.payout_rate_percent?.toString() ?? '')
  const [savedSilver, setSavedSilver] = useState(reward.silver)
  const [savedRate, setSavedRate] = useState<number | null>(reward.payout_rate_percent ?? null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const parsed = parseSilverInput(value)
  const parsedRate = parsePayoutRateInput(rateValue)
  const normalizedRateValue = savedRate?.toString() ?? ''
  const dirty = value !== savedSilver.toString() || rateValue !== normalizedRateValue
  useReportDirty(`role-reward:${reward.role_name}`, dirty)

  const save = () => {
    if (parsed === null) {
      setError(t('numberOnly'))
      return
    }
    if (parsedRate === 'invalid') {
      setError(t('rateInvalid'))
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateRoleReward(reward.role_name, parsed, parsedRate)
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedSilver(parsed)
      setSavedRate(parsedRate)
      setSaved(true)
      router.refresh()
    })
  }

  const remove = () => {
    if (!window.confirm(t('deleteConfirm', { role: translateSlotRole(reward.role_name, tRole) }))) {
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await deleteRoleReward(reward.role_name)
      if (result.error) {
        setError(result.error)
        return
      }
      onDeleted(reward.role_name)
      router.refresh()
    })
  }

  return (
    <li className="grid grid-cols-1 md:grid-cols-[minmax(120px,1fr)_160px_140px_110px_auto] gap-2 items-center bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <span className="text-white text-sm font-semibold min-w-0 truncate">{translateSlotRole(reward.role_name, tRole)}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
          setError('')
        }}
        placeholder={t('silverPlaceholder')}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
        aria-label={t('silverLabel')}
      />
      <input
        type="text"
        inputMode="numeric"
        value={rateValue}
        onChange={(e) => {
          setRateValue(e.target.value)
          setSaved(false)
          setError('')
        }}
        placeholder={t('ratePlaceholder')}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
        aria-label={t('rateLabel')}
      />
      <span className="text-right text-gray-500 text-xs font-mono">
        {formatSilver(parsed ?? reward.silver)}
      </span>
      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black text-xs font-bold px-3 py-1.5 rounded"
      >
        <Save size={12} />
        {pending ? tCommon('saving') : saved && !dirty ? tCommon('saved') : tCommon('save')}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={t('deleteRole')}
        className="inline-flex items-center justify-center text-gray-500 hover:text-red-300 disabled:opacity-30 rounded-lg p-2"
      >
        <Trash2 size={14} />
      </button>
      {error && <span className="md:col-span-5 text-red-400 text-xs">{error}</span>}
    </li>
  )
}
