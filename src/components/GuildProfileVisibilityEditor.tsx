'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import type { AppSettingKey } from '@/lib/app-settings'
import { SectionCard } from '@/components/ui-patterns'

export interface GuildProfileVisibilityValues {
  showMembers: boolean
  showBattles: boolean
  showRegearStats: boolean
  showLeaderboard: boolean
  showStats: boolean
  showAdminTeam: boolean
  showWeapons: boolean
  showRivals: boolean
  showActivity: boolean
}

type VisibilityValueKey = keyof GuildProfileVisibilityValues

interface VisibilityItem {
  valueKey: VisibilityValueKey
  settingKey: AppSettingKey
  labelKey:
    | 'sectionMembers'
    | 'sectionBattles'
    | 'sectionRegearStats'
    | 'sectionLeaderboard'
    | 'sectionStats'
    | 'sectionAdminTeam'
    | 'sectionWeapons'
    | 'sectionRivals'
    | 'sectionActivity'
}

const SAFE_DEFAULT_ITEMS: readonly VisibilityItem[] = [
  {
    valueKey: 'showStats',
    settingKey: 'guild_profile_show_stats',
    labelKey: 'sectionStats',
  },
  {
    valueKey: 'showMembers',
    settingKey: 'guild_profile_show_members',
    labelKey: 'sectionMembers',
  },
  {
    valueKey: 'showBattles',
    settingKey: 'guild_profile_show_battles',
    labelKey: 'sectionBattles',
  },
  {
    valueKey: 'showActivity',
    settingKey: 'guild_profile_show_activity',
    labelKey: 'sectionActivity',
  },
  {
    valueKey: 'showWeapons',
    settingKey: 'guild_profile_show_weapons',
    labelKey: 'sectionWeapons',
  },
  {
    valueKey: 'showRivals',
    settingKey: 'guild_profile_show_rivals',
    labelKey: 'sectionRivals',
  },
] as const

const PRIVATE_DEFAULT_ITEMS: readonly VisibilityItem[] = [
  {
    valueKey: 'showAdminTeam',
    settingKey: 'guild_profile_show_admin_team',
    labelKey: 'sectionAdminTeam',
  },
  {
    valueKey: 'showLeaderboard',
    settingKey: 'guild_profile_show_leaderboard',
    labelKey: 'sectionLeaderboard',
  },
  {
    valueKey: 'showRegearStats',
    settingKey: 'guild_profile_show_regear_stats',
    labelKey: 'sectionRegearStats',
  },
] as const

function VisibilityRow({
  item,
  checked,
  pending,
  disabled,
  onChange,
  label,
}: {
  item: VisibilityItem
  checked: boolean
  pending: boolean
  disabled: boolean
  onChange: (item: VisibilityItem, checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-2/70 px-3 py-2.5 transition-colors hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(item, event.target.checked)}
        className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-amber-500 focus:ring-amber-500"
      />
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-200">
        {checked ? (
          <Eye size={14} className="shrink-0 text-emerald-400" />
        ) : (
          <EyeOff size={14} className="shrink-0 text-gray-600" />
        )}
        <span>{label}</span>
      </span>
      {pending && <Loader2 size={13} className="shrink-0 animate-spin text-amber-300" />}
    </label>
  )
}

export default function GuildProfileVisibilityEditor({
  initialValues,
}: {
  initialValues: GuildProfileVisibilityValues
}) {
  const t = useTranslations('adminGuildProfile')
  const [values, setValues] = useState(initialValues)
  const [pendingKey, setPendingKey] = useState<VisibilityValueKey | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  function save(item: VisibilityItem, checked: boolean) {
    setError('')
    setPendingKey(item.valueKey)
    startTransition(async () => {
      const result = await updateAppSetting(item.settingKey, checked ? 'true' : 'false')
      if (result.error) {
        setError(result.error)
        setPendingKey(null)
        return
      }
      setValues((current) => ({ ...current, [item.valueKey]: checked }))
      setPendingKey(null)
    })
  }

  function renderGroup(
    title: string,
    description: string,
    items: readonly VisibilityItem[],
    privateByDefault: boolean,
  ) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
              privateByDefault
                ? 'bg-violet-500/10 text-violet-300'
                : 'bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {privateByDefault ? t('privateDefaultBadge') : t('publicDefaultBadge')}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <VisibilityRow
              key={item.settingKey}
              item={item}
              checked={values[item.valueKey]}
              pending={pendingKey === item.valueKey}
              disabled={pendingKey !== null}
              onChange={save}
              label={t(item.labelKey)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <SectionCard className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <h2 className="text-base font-bold text-white">{t('sectionsTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            {t('sectionsDescription')}
          </p>
        </div>
      </div>

      {renderGroup(
        t('publicDefaultTitle'),
        t('publicDefaultDescription'),
        SAFE_DEFAULT_ITEMS,
        false,
      )}
      <div className="border-t border-gray-800" />
      {renderGroup(
        t('privateDefaultTitle'),
        t('privateDefaultDescription'),
        PRIVATE_DEFAULT_ITEMS,
        true,
      )}

      <p className="text-[11px] leading-relaxed text-gray-500">
        {t('sectionsDependencyHint')}
      </p>

      {error && (
        <p className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </SectionCard>
  )
}
