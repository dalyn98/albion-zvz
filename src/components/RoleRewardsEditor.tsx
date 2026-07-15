'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Save, Trash2 } from 'lucide-react'
import { deleteRoleReward, updateRoleReward, type RoleReward } from '@/app/actions/regear-admin'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { calcPayoutSilver, isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import { compareStrings } from '@/lib/sort-strings'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useReportDirty } from './UnsavedChangesProvider'
import { EmptyState } from '@/components/ui-patterns'
import { useConfirm } from './ConfirmDialog'

export default function RoleRewardsEditor({ rewards }: { rewards: RoleReward[] }) {
  const resetKey = useMemo(() => rewards.map((reward) => [reward.role_name, reward.silver, reward.payout_rate_percent, reward.updated_at].join(':')).join('|'), [rewards])

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
            return [...withoutSameRole, reward].sort((a, b) =>
              compareStrings(a.role_name, b.role_name),
            )
          })
        }}
      />
      {items.length === 0 ? (
        <EmptyState icon={Save} title={t('noRoles')} />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(120px,1fr)_160px_140px_110px_auto] gap-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500 md:grid">
            <span>{t('roleColumn')}</span>
            <span>{t('silverLabel')}</span>
            <span>{t('rateLabel')}</span>
            <span className="text-right">{t('effectivePayoutLabel')}</span>
            <span className="text-right">{t('actionsLabel')}</span>
          </div>
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
        </>
      )}
    </div>
  )
}

function parsePayoutRateInput(value: string): number | 'invalid' {
  const trimmed = value.trim()
  if (!trimmed) return 'invalid'
  const parsed = Number(trimmed)
  if (!isValidRoleRegearPayoutRate(parsed)) return 'invalid'
  return parsed
}

function normalizeRoleNameInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function NewRoleRewardRow({ onCreated }: { onCreated: (reward: RoleReward) => void }) {
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
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 md:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
      <label className="space-y-1 md:contents">
        <span className="block text-xs font-semibold text-gray-400 md:hidden">{t('roleNameLabel')}</span>
        <input
          type="text"
          value={roleName}
          onChange={(e) => {
            setRoleName(e.target.value)
            setError('')
          }}
          placeholder={t('roleNamePlaceholder')}
          aria-label={t('roleNameLabel')}
          className="min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
        />
      </label>
      <label className="space-y-1 md:contents">
        <span className="block text-xs font-semibold text-gray-400 md:hidden">{t('silverLabel')}</span>
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
          className="min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
        />
      </label>
      <label className="space-y-1 md:contents">
        <span className="block text-xs font-semibold text-gray-400 md:hidden">{t('rateLabel')}</span>
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
          className="min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
        />
      </label>
      <button type="button" onClick={save} disabled={!dirty || pending || !normalizedRoleName || !silverInput.trim() || !rateInput.trim()} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-amber-400 active:scale-[0.96] disabled:opacity-30">
        <Plus size={13} />
        {pending ? tCommon('saving') : t('addRole')}
      </button>
      {error && <p className="md:col-span-4 text-red-400 text-xs">{error}</p>}
    </div>
  )
}

function RoleRow({ reward, onDeleted }: { reward: RoleReward; onDeleted: (roleName: string) => void }) {
  const t = useTranslations('adminRoleRewards')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const confirm = useConfirm()
  const router = useRouter()
  const [value, setValue] = useState(reward.silver.toString())
  const [rateValue, setRateValue] = useState(reward.payout_rate_percent.toString())
  const [savedSilver, setSavedSilver] = useState(reward.silver)
  const [savedRate, setSavedRate] = useState(reward.payout_rate_percent)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const parsed = parseSilverInput(value)
  const parsedRate = parsePayoutRateInput(rateValue)
  const normalizedRateValue = savedRate.toString()
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

  const remove = async () => {
    if (
      !(await confirm({
        body: t('deleteConfirm', {
          role: translateSlotRole(reward.role_name, tRole),
        }),
        confirmLabel: t('deleteRole'),
        destructive: true,
      }))
    )
      return
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

  const effectivePayout = parsed !== null && parsedRate !== 'invalid' ? calcPayoutSilver(parsed, parsedRate) : null

  return (
    <li className="grid grid-cols-1 items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 md:grid-cols-[minmax(120px,1fr)_160px_140px_110px_auto]">
      <span className="min-w-0 truncate text-sm font-semibold text-white">
        <span className="mr-2 text-xs text-gray-400 md:hidden">{t('roleColumn')}</span>
        {translateSlotRole(reward.role_name, tRole)}
      </span>
      <label className="space-y-1 md:contents">
        <span className="block text-xs font-semibold text-gray-400 md:hidden">{t('silverLabel')}</span>
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
          className="min-h-10 flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
          aria-label={t('silverLabel')}
        />
      </label>
      <label className="space-y-1 md:contents">
        <span className="block text-xs font-semibold text-gray-400 md:hidden">{t('rateLabel')}</span>
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
          className="min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
          aria-label={t('rateLabel')}
        />
      </label>
      <span className="text-right text-gray-500 text-xs font-mono tabular-nums">{effectivePayout === null ? '—' : formatSilver(effectivePayout)}</span>
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={save} disabled={!dirty || pending} className="flex min-h-10 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 active:scale-[0.96] disabled:opacity-30">
          <Save size={12} />
          {pending ? tCommon('saving') : saved && !dirty ? tCommon('saved') : tCommon('save')}
        </button>
        <button type="button" onClick={remove} disabled={pending} aria-label={t('deleteRole')} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:text-red-300 active:scale-[0.96] disabled:opacity-30">
          <Trash2 size={14} />
        </button>
      </div>
      {error && <span className="md:col-span-5 text-red-400 text-xs">{error}</span>}
    </li>
  )
}
