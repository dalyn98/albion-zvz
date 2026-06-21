'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import { updateRoleReward, type RoleReward } from '@/app/actions/regear-admin'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useReportDirty } from './UnsavedChangesProvider'
import { EmptyState } from '@/components/ui-patterns'

export default function RoleRewardsEditor({ rewards }: { rewards: RoleReward[] }) {
  const t = useTranslations('adminRoleRewards')
  if (rewards.length === 0) {
    return <EmptyState icon={Save} title={t('noRoles')} />
  }
  return (
    <ul className="space-y-2">
      {rewards.map((r) => (
        <RoleRow key={r.role_name} reward={r} />
      ))}
    </ul>
  )
}

function RoleRow({ reward }: { reward: RoleReward }) {
  const t = useTranslations('adminRoleRewards')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const [value, setValue] = useState(reward.silver.toString())
  const [savedSilver, setSavedSilver] = useState(reward.silver)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const parsed = parseSilverInput(value)
  const dirty = parsed !== null && parsed !== savedSilver
  useReportDirty(`role-reward:${reward.role_name}`, dirty)

  const save = () => {
    if (parsed === null) {
      setError(t('numberOnly'))
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateRoleReward(reward.role_name, parsed)
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedSilver(parsed)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <span className="w-20 text-white text-sm font-semibold flex-shrink-0">{translateSlotRole(reward.role_name, tRole)}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        placeholder={t('silverPlaceholder')}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
      />
      <span className="w-28 text-right text-gray-500 text-xs font-mono flex-shrink-0">
        {formatSilver(parsed ?? reward.silver)}
      </span>
      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black text-xs font-bold px-3 py-1.5 rounded"
      >
        <Save size={12} />
        {pending ? tCommon('saving') : saved && !dirty ? '✓' : tCommon('save')}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </li>
  )
}
