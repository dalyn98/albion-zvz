'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Plus, Save, Search, Trash2 } from 'lucide-react'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'
import {
  deleteRegearDiscordRolePolicy,
  upsertRegearDiscordRolePolicy,
  type RegearDiscordRolePolicy,
} from '@/app/actions/regear-role-policies'
import { updateAppSetting } from '@/app/actions/settings'
import {
  REGEAR_ROLE_GROUPS,
  type RegearRoleGroup,
} from '@/lib/regear-role-policy'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { useReportDirty } from './UnsavedChangesProvider'
import { EmptyState } from './ui-patterns'

interface Props {
  initialEnabled: boolean
  initialPolicies: RegearDiscordRolePolicy[]
}

export default function RegearDiscordRolePoliciesEditor({
  initialEnabled,
  initialPolicies,
}: Props) {
  const t = useTranslations('adminRegearRolePolicies')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [savedEnabled, setSavedEnabled] = useState(initialEnabled)
  const [policies, setPolicies] = useState(initialPolicies)
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [rolesError, setRolesError] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const [toggleSaved, setToggleSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const toggleDirty = enabled !== savedEnabled
  useReportDirty('regear-role-policy-toggle', toggleDirty)

  useEffect(() => {
    void (async () => {
      const result = await listGuildRoles()
      if (result.error) {
        setRolesError(true)
        return
      }
      setRoles(result.roles)
    })()
  }, [])

  const saveToggle = () => {
    setToggleError('')
    setToggleSaved(false)
    startTransition(async () => {
      const result = await updateAppSetting(
        'regear_discord_role_policy_enabled',
        enabled ? 'true' : 'false',
      )
      if (result.error) {
        setToggleError(result.error)
        return
      }
      setSavedEnabled(enabled)
      setToggleSaved(true)
      router.refresh()
    })
  }

  return (
    <details className="rounded-lg border border-gray-800 bg-gray-900/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('description')}</p>
        </div>
        <ChevronDown size={16} className="shrink-0 text-gray-500" />
      </summary>

      <div className="space-y-4 border-t border-gray-800 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-950/60 px-3 py-2">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked)
                setToggleSaved(false)
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-amber-500"
            />
            <span>
              <span className="block text-sm font-semibold text-white">{t('enabledLabel')}</span>
              <span className="block text-xs text-gray-500">{t('enabledHint')}</span>
            </span>
          </label>
          <button
            type="button"
            onClick={saveToggle}
            disabled={!toggleDirty || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-30"
          >
            <Save size={12} />
            {pending ? tCommon('saving') : toggleSaved && !toggleDirty ? tCommon('saved') : tCommon('save')}
          </button>
        </div>
        {toggleError && <p className="text-xs text-red-400">{toggleError}</p>}

        {rolesError && <p className="text-xs text-red-400">{t('rolesError')}</p>}
        {!rolesError && roles === null && <p className="text-xs text-gray-500">{t('rolesLoading')}</p>}
        {roles && (
          <NewPolicyRow
            roles={roles}
            onSaved={(policy) => {
              setPolicies((prev) => {
                const next = prev.filter((item) => item.id !== policy.id)
                return [...next, policy].sort(policySort)
              })
            }}
          />
        )}

        {policies.length === 0 ? (
          <EmptyState icon={Plus} title={t('emptyTitle')} />
        ) : (
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <ul className="space-y-2">
              {policies.map((policy) => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  roles={roles ?? []}
                  onSaved={(nextPolicy) => {
                    setPolicies((prev) =>
                      prev.map((item) => (item.id === nextPolicy.id ? nextPolicy : item)).sort(policySort),
                    )
                  }}
                  onDeleted={(id) => setPolicies((prev) => prev.filter((item) => item.id !== id))}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function policySort(a: RegearDiscordRolePolicy, b: RegearDiscordRolePolicy): number {
  if (a.roleGroup !== b.roleGroup) return a.roleGroup.localeCompare(b.roleGroup)
  if (b.silverCap !== a.silverCap) return b.silverCap - a.silverCap
  return a.discordRoleName.localeCompare(b.discordRoleName)
}

function groupLabel(t: ReturnType<typeof useTranslations>, group: RegearRoleGroup): string {
  return t(`group_${group}` as const)
}

function RoleGroupSelect({
  value,
  onChange,
  disabled,
}: {
  value: RegearRoleGroup
  onChange: (value: RegearRoleGroup) => void
  disabled: boolean
}) {
  const t = useTranslations('adminRegearRolePolicies')
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as RegearRoleGroup)}
      disabled={disabled}
      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
    >
      {REGEAR_ROLE_GROUPS.map((group) => (
        <option key={group} value={group}>
          {groupLabel(t, group)}
        </option>
      ))}
    </select>
  )
}

function NewPolicyRow({
  roles,
  onSaved,
}: {
  roles: DiscordRoleOption[]
  onSaved: (policy: RegearDiscordRolePolicy) => void
}) {
  const t = useTranslations('adminRegearRolePolicies')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [roleGroup, setRoleGroup] = useState<RegearRoleGroup>('dps')
  const [silverInput, setSilverInput] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null
  const parsedSilver = parseSilverInput(silverInput)
  const dirty = Boolean(selectedRoleId || silverInput.trim())
  useReportDirty('regear-role-policy:new', dirty && silverInput.trim().length > 0)

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roles.slice(0, 50)
    return roles
      .filter((role) => role.name.toLowerCase().includes(q) || role.id.includes(q))
      .slice(0, 50)
  }, [roles, search])

  const save = () => {
    if (!selectedRole) {
      setError(t('roleRequired'))
      return
    }
    if (parsedSilver === null) {
      setError(t('silverInvalid'))
      return
    }
    setError('')
    startTransition(async () => {
      const result = await upsertRegearDiscordRolePolicy({
        discordRoleId: selectedRole.id,
        discordRoleName: selectedRole.name,
        roleGroup,
        silverCap: parsedSilver,
      })
      if (result.error || !result.policy) {
        setError(result.error ?? t('saveFailed'))
        return
      }
      onSaved(result.policy)
      setSilverInput('')
    })
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
          <Search size={12} className="shrink-0 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('roleSearchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
          />
        </div>
        <select
          value={selectedRoleId}
          onChange={(event) => setSelectedRoleId(event.target.value)}
          disabled={pending}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {filteredRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      <RoleGroupSelect value={roleGroup} onChange={setRoleGroup} disabled={pending} />
      <input
        type="text"
        inputMode="numeric"
        value={silverInput}
        onChange={(event) => {
          setSilverInput(event.target.value)
          setError('')
        }}
        placeholder={t('silverPlaceholder')}
        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending || !selectedRoleId || !silverInput.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-30"
      >
        <Plus size={13} />
        {pending ? tCommon('saving') : t('add')}
      </button>
      {error && <p className="text-xs text-red-400 md:col-span-4">{error}</p>}
    </div>
  )
}

function PolicyRow({
  policy,
  roles,
  onSaved,
  onDeleted,
}: {
  policy: RegearDiscordRolePolicy
  roles: DiscordRoleOption[]
  onSaved: (policy: RegearDiscordRolePolicy) => void
  onDeleted: (id: string) => void
}) {
  const t = useTranslations('adminRegearRolePolicies')
  const tCommon = useTranslations('common')
  const roleFromList = roles.find((role) => role.id === policy.discordRoleId)
  const [roleGroup, setRoleGroup] = useState(policy.roleGroup)
  const [silverInput, setSilverInput] = useState(String(policy.silverCap))
  const [savedRoleGroup, setSavedRoleGroup] = useState(policy.roleGroup)
  const [savedSilver, setSavedSilver] = useState(policy.silverCap)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const parsedSilver = parseSilverInput(silverInput)
  const dirty = roleGroup !== savedRoleGroup || silverInput !== String(savedSilver)
  useReportDirty(`regear-role-policy:${policy.id}`, dirty)

  const save = () => {
    if (parsedSilver === null) {
      setError(t('silverInvalid'))
      return
    }
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await upsertRegearDiscordRolePolicy({
        id: policy.id,
        discordRoleId: policy.discordRoleId,
        discordRoleName: roleFromList?.name ?? policy.discordRoleName,
        roleGroup,
        silverCap: parsedSilver,
      })
      if (result.error || !result.policy) {
        setError(result.error ?? t('saveFailed'))
        return
      }
      setSavedRoleGroup(result.policy.roleGroup)
      setSavedSilver(result.policy.silverCap)
      setSaved(true)
      onSaved(result.policy)
    })
  }

  const remove = () => {
    if (!window.confirm(t('deleteConfirm', { role: policy.discordRoleName }))) return
    setError('')
    startTransition(async () => {
      const result = await deleteRegearDiscordRolePolicy(policy.id)
      if (result.error) {
        setError(result.error)
        return
      }
      onDeleted(policy.id)
    })
  }

  return (
    <li className="grid grid-cols-1 items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_150px_150px_88px_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">
          {roleFromList?.name ?? policy.discordRoleName}
        </p>
        <p className="truncate font-mono text-[11px] text-gray-500">{policy.discordRoleId}</p>
      </div>
      <RoleGroupSelect value={roleGroup} onChange={setRoleGroup} disabled={pending} />
      <input
        type="text"
        inputMode="numeric"
        value={silverInput}
        onChange={(event) => {
          setSilverInput(event.target.value)
          setSaved(false)
          setError('')
        }}
        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-amber-500 focus:outline-none"
      />
      <span className="text-right font-mono text-xs text-gray-500">
        {formatSilver(parsedSilver ?? policy.silverCap)}
      </span>
      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-30"
        >
          {saved && !dirty ? <Check size={12} /> : <Save size={12} />}
          {pending ? tCommon('saving') : saved && !dirty ? tCommon('saved') : tCommon('save')}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={t('delete')}
          className="rounded-lg p-2 text-gray-500 hover:text-red-300 disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 md:col-span-5">{error}</p>}
    </li>
  )
}
