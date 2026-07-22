'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldCheck, UserCog, Plus, Save, Trash2, X } from 'lucide-react'
import {
  ACTIVE_CAPABILITY_KEYS,
  CAP,
  CAPABILITY_GROUPS,
  CAPABILITY_PRESETS,
  type CapabilityKey,
  getCapabilityPresetBits,
  parseCapabilities,
  serializeCapabilities,
} from '@/lib/permissions'
import {
  deleteRoleGrant,
  deleteUserOverride,
  upsertRoleGrant,
  upsertUserOverride,
  type RoleGrantRow,
  type UserOverrideRow,
} from '@/app/actions/permissions'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  initialRoleGrants: RoleGrantRow[]
  initialUserOverrides: UserOverrideRow[]
}

// 0n 비트셋에서 시작해 picker 결과대로 capability 비트를 누적/제거.
// `useReducer` 까지는 과한 상태량이라 helper 로 단순화.
function toggleBit(current: bigint, cap: bigint, on: boolean): bigint {
  return on ? current | cap : current & ~cap
}

interface CapabilityPickerProps {
  value: string
  onChange: (next: string) => void
  showPresets?: boolean
}

function CapabilityPicker({ value, onChange, showPresets = true }: CapabilityPickerProps) {
  const t = useTranslations('permissions')
  const bits = parseCapabilities(value)
  const [capabilitySearch, setCapabilitySearch] = useState('')
  const normalizedSearch = capabilitySearch.trim().toLocaleLowerCase()
  const filteredGroups = Object.entries(CAPABILITY_GROUPS)
    .map(([group, capKeys]) => ({
      group,
      capKeys: (capKeys as CapabilityKey[]).filter((key) => {
        if (!normalizedSearch) return true
        return `${key} ${t(`capability.${key}`)}`.toLocaleLowerCase().includes(normalizedSearch)
      }),
    }))
    .filter(({ capKeys }) => capKeys.length > 0)

  return (
    <div className="space-y-3">
      {showPresets && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div>
            <p className="text-xs font-semibold text-amber-200">
              {t('presets.title')}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {t('presets.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITY_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() =>
                  onChange(
                    serializeCapabilities(bits | getCapabilityPresetBits(preset.capabilities)),
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-gray-950 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:border-amber-300 hover:text-amber-100"
              >
                <Plus size={11} />
                {t(`presets.${preset.key}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-gray-300">{t('capabilitySearchLabel')}</span>
        <input
          type="search"
          value={capabilitySearch}
          onChange={(event) => setCapabilitySearch(event.target.value)}
          placeholder={t('capabilitySearchPlaceholder')}
          className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-white outline-none focus:border-amber-500/60"
        />
      </label>
      {filteredGroups.map(({ group, capKeys }) => (
        <div key={group} className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <div className="text-xs font-semibold text-amber-300 mb-2 uppercase tracking-wide">
            {t(`capabilityGroup.${group}`)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(capKeys as CapabilityKey[]).map((key) => {
              const cap = CAP[key]
              const on = (bits & cap) !== 0n
              return (
                <label
                  key={key}
                  className="flex items-start gap-2 text-sm text-gray-200 hover:text-white cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      onChange(serializeCapabilities(toggleBit(bits, cap, e.target.checked)))
                    }
                    className="mt-0.5 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                  />
                  <span>{t(`capability.${key}`)}</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-700 px-3 py-5 text-center text-sm text-gray-500">
          {t('capabilitySearchNoResults')}
        </p>
      )}
    </div>
  )
}

interface RoleGrantFormState {
  discordRoleId: string
  capabilities: string
  notes: string
}

interface RoleGrantFormProps {
  initial?: RoleGrantRow
  onSaved: () => void
  onCancel?: () => void
}

function RoleGrantForm({ initial, onSaved, onCancel }: RoleGrantFormProps) {
  const t = useTranslations('permissions')
  const [form, setForm] = useState<RoleGrantFormState>({
    discordRoleId: initial?.discordRoleId ?? '',
    capabilities: initial?.capabilities ?? '0',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const initialBits = parseCapabilities(initial?.capabilities ?? '0')
  const currentBits = parseCapabilities(form.capabilities)
  const addedBits = currentBits & ~initialBits
  const removedBits = initialBits & ~currentBits
  const changeSummary = {
    added: capabilityLabels(addedBits, t),
    removed: capabilityLabels(removedBits, t),
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await upsertRoleGrant({
        discordRoleId: form.discordRoleId.trim(),
        capabilities: form.capabilities,
        notes: form.notes,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">{t('roleGrantEditor.discordRoleIdLabel')}</span>
          <input
            type="text"
            value={form.discordRoleId}
            disabled={!!initial}
            onChange={(e) => setForm((f) => ({ ...f, discordRoleId: e.target.value }))}
            placeholder={t('roleGrantEditor.discordRoleIdPlaceholder')}
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">{t('roleGrantEditor.notesLabel')}</span>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-white"
          />
        </label>
      </div>

      <CapabilityPicker
        value={form.capabilities}
        onChange={(next) => setForm((f) => ({ ...f, capabilities: next }))}
      />

      <CapabilityChangeSummary
        added={changeSummary.added}
        removed={changeSummary.removed}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
          >
            <X size={14} />
            {t('actions.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={isPending || form.discordRoleId.trim().length === 0}
          className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {t('actions.save')}
        </button>
      </div>
    </div>
  )
}

interface UserOverrideFormState {
  discordId: string
  capabilitiesGranted: string
  capabilitiesRevoked: string
  notes: string
}

interface UserOverrideFormProps {
  initial?: UserOverrideRow
  onSaved: () => void
  onCancel?: () => void
}

function UserOverrideForm({ initial, onSaved, onCancel }: UserOverrideFormProps) {
  const t = useTranslations('permissions')
  const [form, setForm] = useState<UserOverrideFormState>({
    discordId: initial?.discordId ?? '',
    capabilitiesGranted: initial?.capabilitiesGranted ?? '0',
    capabilitiesRevoked: initial?.capabilitiesRevoked ?? '0',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const grantedBits = parseCapabilities(form.capabilitiesGranted)
  const revokedBits = parseCapabilities(form.capabilitiesRevoked)
  const conflictingCapabilities = grantedBits & revokedBits
  const effectiveCapabilities = grantedBits & ~revokedBits
  const changeSummary = {
    added: capabilityLabels(effectiveCapabilities, t),
    removed: capabilityLabels(revokedBits, t),
  }

  function submit() {
    if (conflictingCapabilities !== 0n) {
      setError(t('conflictWarning'))
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await upsertUserOverride({
        discordId: form.discordId.trim(),
        capabilitiesGranted: form.capabilitiesGranted,
        capabilitiesRevoked: form.capabilitiesRevoked,
        notes: form.notes,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">{t('userOverrideEditor.discordIdLabel')}</span>
          <input
            type="text"
            value={form.discordId}
            disabled={!!initial}
            onChange={(e) => setForm((f) => ({ ...f, discordId: e.target.value }))}
            placeholder={t('userOverrideEditor.discordIdPlaceholder')}
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">{t('userOverrideEditor.notesLabel')}</span>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-white"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-emerald-300 mb-1">
            {t('userOverrideEditor.grantedHeading')}
          </div>
          <CapabilityPicker
            value={form.capabilitiesGranted}
            onChange={(next) => setForm((f) => ({ ...f, capabilitiesGranted: next }))}
          />
        </div>
        <div>
          <div className="text-sm font-semibold text-rose-300 mb-1">
            {t('userOverrideEditor.revokedHeading')}
          </div>
          <CapabilityPicker
            value={form.capabilitiesRevoked}
            showPresets={false}
            onChange={(next) => setForm((f) => ({ ...f, capabilitiesRevoked: next }))}
          />
        </div>
      </div>

      <CapabilityChangeSummary
        added={changeSummary.added}
        removed={changeSummary.removed}
      />

      {conflictingCapabilities !== 0n && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {t('conflictWarning')}: {capabilityLabels(conflictingCapabilities, t).join(', ')}
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
          >
            <X size={14} />
            {t('actions.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={isPending || form.discordId.trim().length === 0 || conflictingCapabilities !== 0n}
          className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {t('actions.save')}
        </button>
      </div>
    </div>
  )
}

function capabilityLabels(
  bits: bigint,
  t: ReturnType<typeof useTranslations<'permissions'>>,
): string[] {
  return ACTIVE_CAPABILITY_KEYS
    .filter((key) => (bits & CAP[key]) !== 0n)
    .map((key) => t(`capability.${key}`))
}

function CapabilityChangeSummary({
  added,
  removed,
}: {
  added: string[]
  removed: string[]
}) {
  const t = useTranslations('permissions')
  const unchanged = added.length === 0 && removed.length === 0
  return (
    <section className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <h3 className="text-xs font-semibold text-sky-100">{t('changeSummaryTitle')}</h3>
      {unchanged ? (
        <p className="mt-1 text-xs text-gray-500">{t('changeSummaryUnchanged')}</p>
      ) : (
        <div className="mt-2 space-y-1 text-xs">
          {added.length > 0 && (
            <p className="text-emerald-300">{t('changeSummaryAdded')}: {added.join(', ')}</p>
          )}
          {removed.length > 0 && (
            <p className="text-rose-300">{t('changeSummaryRemoved')}: {removed.join(', ')}</p>
          )}
        </div>
      )}
      <p className="mt-2 text-[10px] text-gray-500">{t('effectiveCapabilities')}</p>
    </section>
  )
}

interface RoleGrantRowItemProps {
  grant: RoleGrantRow
}

function RoleGrantRowItem({ grant }: RoleGrantRowItemProps) {
  const t = useTranslations('permissions')
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const askConfirm = useConfirm()

  async function remove() {
    const ok = await askConfirm({
      body: t('actions.deleteConfirm'),
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const res = await deleteRoleGrant(grant.discordRoleId)
      if (res.error) setError(res.error)
    })
  }

  if (editing) {
    return (
      <RoleGrantForm
        initial={grant}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const bits = parseCapabilities(grant.capabilities)
  const enabledLabels: string[] = []
  for (const key of ACTIVE_CAPABILITY_KEYS) {
    if ((bits & CAP[key]) !== 0n) enabledLabels.push(t(`capability.${key}`))
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="font-mono text-sm text-amber-200">{grant.discordRoleId}</div>
          {grant.notes && <div className="text-sm text-gray-400">{grant.notes}</div>}
          <div className="text-xs text-gray-500">
            {enabledLabels.length === 0
              ? t('listItem.noCapabilities')
              : enabledLabels.join(', ')}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            {t('actions.edit')}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="rounded border border-rose-700/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/30 disabled:opacity-50"
          >
            <Trash2 size={12} className="inline -mt-0.5 mr-1" />
            {t('actions.delete')}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

interface UserOverrideRowItemProps {
  override: UserOverrideRow
}

function UserOverrideRowItem({ override }: UserOverrideRowItemProps) {
  const t = useTranslations('permissions')
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const askConfirm = useConfirm()

  async function remove() {
    const ok = await askConfirm({
      body: t('actions.deleteConfirm'),
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const res = await deleteUserOverride(override.discordId)
      if (res.error) setError(res.error)
    })
  }

  if (editing) {
    return (
      <UserOverrideForm
        initial={override}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const grantedBits = parseCapabilities(override.capabilitiesGranted)
  const revokedBits = parseCapabilities(override.capabilitiesRevoked)
  const grantedLabels: string[] = []
  const revokedLabels: string[] = []
  for (const key of ACTIVE_CAPABILITY_KEYS) {
    if ((grantedBits & CAP[key]) !== 0n) grantedLabels.push(t(`capability.${key}`))
    if ((revokedBits & CAP[key]) !== 0n) revokedLabels.push(t(`capability.${key}`))
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="font-mono text-sm text-amber-200">{override.discordId}</div>
          {override.notes && <div className="text-sm text-gray-400">{override.notes}</div>}
          {grantedLabels.length > 0 && (
            <div className="text-xs text-emerald-300">
              + {grantedLabels.join(', ')}
            </div>
          )}
          {revokedLabels.length > 0 && (
            <div className="text-xs text-rose-300">- {revokedLabels.join(', ')}</div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            {t('actions.edit')}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="rounded border border-rose-700/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/30 disabled:opacity-50"
          >
            <Trash2 size={12} className="inline -mt-0.5 mr-1" />
            {t('actions.delete')}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function PermissionsEditor({
  initialRoleGrants,
  initialUserOverrides,
}: Props) {
  const t = useTranslations('permissions')
  const [addingRole, setAddingRole] = useState(false)
  const [addingUser, setAddingUser] = useState(false)

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-300" />
            {t('roleGrantEditor.heading')}
          </h2>
          {!addingRole && (
            <button
              type="button"
              onClick={() => setAddingRole(true)}
              className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-amber-400"
            >
              <Plus size={14} />
              {t('actions.addRoleGrant')}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">{t('roleGrantEditor.description')}</p>

        {addingRole && (
          <RoleGrantForm
            onSaved={() => setAddingRole(false)}
            onCancel={() => setAddingRole(false)}
          />
        )}

        {initialRoleGrants.length === 0 && !addingRole ? (
          <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
            {t('roleGrantEditor.emptyState')}
          </div>
        ) : (
          <div className="space-y-2">
            {initialRoleGrants.map((g) => (
              <RoleGrantRowItem key={g.discordRoleId} grant={g} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <UserCog size={18} className="text-amber-300" />
            {t('userOverrideEditor.heading')}
          </h2>
          {!addingUser && (
            <button
              type="button"
              onClick={() => setAddingUser(true)}
              className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-amber-400"
            >
              <Plus size={14} />
              {t('actions.addUserOverride')}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">{t('userOverrideEditor.description')}</p>

        {addingUser && (
          <UserOverrideForm
            onSaved={() => setAddingUser(false)}
            onCancel={() => setAddingUser(false)}
          />
        )}

        {initialUserOverrides.length === 0 && !addingUser ? (
          <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
            {t('userOverrideEditor.emptyState')}
          </div>
        ) : (
          <div className="space-y-2">
            {initialUserOverrides.map((u) => (
              <UserOverrideRowItem key={u.discordId} override={u} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
