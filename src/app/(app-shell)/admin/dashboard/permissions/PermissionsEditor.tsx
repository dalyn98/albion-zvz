'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  Clock3,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import {
  deleteRoleGrant,
  revokeUserOverride,
  upsertRoleGrant,
  upsertUserOverride,
  type PermissionMemberOption,
  type PermissionRoleOption,
  type RoleGrantRow,
  type UserOverrideRow,
} from '@/app/actions/permissions'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  ACTIVE_CAPABILITY_KEYS,
  CAP,
  CAPABILITY_GROUPS,
  CAPABILITY_PRESETS,
  getCapabilityPresetBits,
  parseCapabilities,
  serializeCapabilities,
  type CapabilityKey,
} from '@/lib/permissions'
import { formatRoleGrantNoteForDisplay } from '@/lib/permission-role-grant-note'

interface Props {
  initialRoleGrants: RoleGrantRow[]
  initialUserOverrides: UserOverrideRow[]
  roles: PermissionRoleOption[]
  members: PermissionMemberOption[]
}

function toggleBit(current: bigint, cap: bigint, enabled: boolean): bigint {
  return enabled ? current | cap : current & ~cap
}

function toLocalDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function expiryFromNow(days: number): string {
  return toLocalDateTime(
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
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

interface CapabilityPickerProps {
  value: string
  onChange: (next: string) => void
  showPresets?: boolean
}

function CapabilityPicker({
  value,
  onChange,
  showPresets = true,
}: CapabilityPickerProps) {
  const t = useTranslations('permissions')
  const bits = parseCapabilities(value)
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const groups = Object.entries(CAPABILITY_GROUPS)
    .map(([group, keys]) => ({
      group,
      keys: (keys as CapabilityKey[]).filter((key) => {
        if (!normalizedSearch) return true
        return `${key} ${t(`capability.${key}`)}`
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      }),
    }))
    .filter(({ keys }) => keys.length > 0)

  return (
    <div className="space-y-3">
      {showPresets ? (
        <section className="space-y-2 rounded-xl bg-amber-500/5 p-3 shadow-[0_0_0_1px_rgba(245,158,11,0.24)]">
          <div>
            <p className="text-xs font-semibold text-amber-200">
              {t('presets.title')}
            </p>
            <p className="mt-0.5 text-pretty text-[11px] text-gray-400">
              {t('presets.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() =>
                  onChange(
                    serializeCapabilities(
                      bits | getCapabilityPresetBits(preset.capabilities),
                    ),
                  )
                }
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gray-950 px-3 text-xs font-semibold text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.3)] transition-transform active:scale-[0.96]"
              >
                <Plus size={13} aria-hidden />
                {t(`presets.${preset.key}`)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-semibold text-gray-300">
          {t('capabilitySearchLabel')}
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('capabilitySearchPlaceholder')}
          className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-white outline-none focus:border-amber-500/60"
        />
      </label>

      {groups.map(({ group, keys }) => (
        <section
          key={group}
          className="rounded-xl bg-gray-900/50 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        >
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t(`capabilityGroup.${group}`)}
          </h4>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {keys.map((key) => {
              const cap = CAP[key]
              const checked = (bits & cap) !== 0n
              return (
                <label
                  key={key}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-gray-200 hover:bg-white/[0.04] hover:text-white"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onChange(
                        serializeCapabilities(
                          toggleBit(bits, cap, event.target.checked),
                        ),
                      )
                    }
                    className="size-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                  />
                  <span>{t(`capability.${key}`)}</span>
                </label>
              )
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-700 px-3 py-5 text-center text-sm text-gray-500">
          {t('capabilitySearchNoResults')}
        </p>
      ) : null}
    </div>
  )
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
    <section className="rounded-xl bg-sky-500/5 p-3 shadow-[0_0_0_1px_rgba(14,165,233,0.22)]">
      <h3 className="text-xs font-semibold text-sky-100">
        {t('changeSummaryTitle')}
      </h3>
      {unchanged ? (
        <p className="mt-1 text-xs text-gray-500">
          {t('changeSummaryUnchanged')}
        </p>
      ) : (
        <div className="mt-2 space-y-1 text-xs">
          {added.length > 0 ? (
            <p className="text-pretty text-emerald-300">
              {t('changeSummaryAdded')}: {added.join(', ')}
            </p>
          ) : null}
          {removed.length > 0 ? (
            <p className="text-pretty text-rose-300">
              {t('changeSummaryRemoved')}: {removed.join(', ')}
            </p>
          ) : null}
        </div>
      )}
      <p className="mt-2 text-pretty text-[10px] text-gray-500">
        {t('effectiveCapabilities')}
      </p>
    </section>
  )
}

interface RoleGrantFormState {
  discordRoleId: string
  capabilities: string
  notes: string
}

function RoleGrantForm({
  initial,
  roles,
  onSaved,
  onCancel,
}: {
  initial?: RoleGrantRow
  roles: PermissionRoleOption[]
  onSaved: () => void
  onCancel: () => void
}) {
  const t = useTranslations('permissions')
  const [form, setForm] = useState<RoleGrantFormState>({
    discordRoleId: initial?.discordRoleId ?? '',
    capabilities: initial?.capabilities ?? '0',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const selectedRole = roles.find((role) => role.id === form.discordRoleId)

  const initialBits = parseCapabilities(initial?.capabilities ?? '0')
  const currentBits = parseCapabilities(form.capabilities)
  const added = capabilityLabels(currentBits & ~initialBits, t)
  const removed = capabilityLabels(initialBits & ~currentBits, t)

  function submit() {
    if (!selectedRole) {
      setError(t('roleGrantEditor.roleRequired'))
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await upsertRoleGrant({
        discordRoleId: selectedRole.id,
        discordRoleName: selectedRole.name,
        capabilities: form.capabilities,
        notes: form.notes,
        expectedUpdatedAt: initial?.updatedAt ?? null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl bg-gray-900/70 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('roleGrantEditor.discordRoleLabel')}
          </span>
          <select
            value={form.discordRoleId}
            disabled={!!initial}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                discordRoleId: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t('roleGrantEditor.discordRolePlaceholder')}</option>
            {initial && !selectedRole ? (
              <option value={initial.discordRoleId}>
                {initial.discordRoleName}
              </option>
            ) : null}
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name} · {t('roleGrantEditor.memberCount', { count: role.memberCount })}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('roleGrantEditor.notesLabel')}
          </span>
          <input
            type="text"
            value={formatRoleGrantNoteForDisplay(
              form.notes,
              t('roleGrantEditor.legacyAdminRoleMigrationNote'),
            )}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white"
          />
        </label>
      </div>

      {selectedRole ? (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/5 px-3 py-2 text-sm text-amber-100 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]">
          <Users size={16} aria-hidden />
          <span className="text-pretty">
            {t('roleGrantEditor.impactPreview', {
              role: selectedRole.name,
              count: selectedRole.memberCount,
            })}
          </span>
        </div>
      ) : null}

      <CapabilityPicker
        value={form.capabilities}
        onChange={(capabilities) =>
          setForm((current) => ({ ...current, capabilities }))
        }
      />
      <CapabilityChangeSummary added={added} removed={removed} />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-gray-200 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] transition-transform active:scale-[0.96]"
        >
          <X size={15} aria-hidden />
          {t('actions.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={
            isPending ||
            !selectedRole ||
            parseCapabilities(form.capabilities) === 0n
          }
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 pl-3 pr-3.5 text-sm font-semibold text-gray-950 transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={15} aria-hidden />
          {t('actions.save')}
        </button>
      </div>
    </div>
  )
}

function RoleGrantCard({
  grant,
  role,
  roles,
}: {
  grant: RoleGrantRow
  role?: PermissionRoleOption
  roles: PermissionRoleOption[]
}) {
  const t = useTranslations('permissions')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const askConfirm = useConfirm()
  const labels = capabilityLabels(parseCapabilities(grant.capabilities), t)

  async function remove() {
    const confirmed = await askConfirm({
      body: t('actions.deleteRoleConfirm', {
        role: grant.discordRoleName,
        count: role?.memberCount ?? 0,
      }),
      destructive: true,
    })
    if (!confirmed) return
    setError(null)
    startTransition(async () => {
      const result = await deleteRoleGrant({
        discordRoleId: grant.discordRoleId,
        expectedUpdatedAt: grant.updatedAt,
      })
      if (result.error) setError(result.error)
    })
  }

  if (editing) {
    return (
      <RoleGrantForm
        initial={grant}
        roles={roles}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <article className="rounded-xl bg-gray-900/45 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-amber-100">
              @{grant.discordRoleName}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300 tabular-nums">
              <Users size={12} aria-hidden />
              {t('roleGrantEditor.memberCount', {
                count: role?.memberCount ?? 0,
              })}
            </span>
          </div>
          {grant.notes ? (
            <p className="text-pretty text-sm text-gray-400">
              {formatRoleGrantNoteForDisplay(
                grant.notes,
                t('roleGrantEditor.legacyAdminRoleMigrationNote'),
              )}
            </p>
          ) : null}
          <p className="text-pretty text-xs leading-5 text-gray-500">
            {labels.length > 0
              ? labels.join(', ')
              : t('listItem.noCapabilities')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-10 rounded-lg px-3 text-xs text-gray-200 shadow-[0_0_0_1px_rgba(255,255,255,0.14)] transition-transform active:scale-[0.96]"
          >
            {t('actions.edit')}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            aria-label={t('actions.delete')}
            className="inline-flex size-10 items-center justify-center rounded-lg text-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.35)] transition-transform active:scale-[0.96] disabled:opacity-50"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </article>
  )
}

interface UserOverrideFormState {
  discordId: string
  capabilitiesGranted: string
  capabilitiesRevoked: string
  reason: string
  expiresAt: string
  notes: string
}

function UserOverrideForm({
  initial,
  members,
  onSaved,
  onCancel,
}: {
  initial?: UserOverrideRow
  members: PermissionMemberOption[]
  onSaved: () => void
  onCancel: () => void
}) {
  const t = useTranslations('permissions')
  const [form, setForm] = useState<UserOverrideFormState>({
    discordId: initial?.discordId ?? '',
    capabilitiesGranted: initial?.capabilitiesGranted ?? '0',
    capabilitiesRevoked: initial?.capabilitiesRevoked ?? '0',
    reason: initial?.reason ?? '',
    expiresAt: initial ? toLocalDateTime(initial.expiresAt) : '',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const grantedBits = parseCapabilities(form.capabilitiesGranted)
  const revokedBits = parseCapabilities(form.capabilitiesRevoked)
  const conflictBits = grantedBits & revokedBits
  const selectedMember = members.find(
    (member) => member.id === form.discordId,
  )

  function submit() {
    if (conflictBits !== 0n) {
      setError(t('conflictWarning'))
      return
    }
    const expiresAt = new Date(form.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) {
      setError(t('userOverrideEditor.expiryRequired'))
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await upsertUserOverride({
        discordId: form.discordId,
        capabilitiesGranted: form.capabilitiesGranted,
        capabilitiesRevoked: form.capabilitiesRevoked,
        reason: form.reason,
        expiresAt: expiresAt.toISOString(),
        notes: form.notes,
        expectedUpdatedAt: initial?.updatedAt ?? null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl bg-gray-900/70 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('userOverrideEditor.discordMemberLabel')}
          </span>
          <select
            value={form.discordId}
            disabled={!!initial}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                discordId: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {t('userOverrideEditor.discordMemberPlaceholder')}
            </option>
            {initial && !selectedMember ? (
              <option value={initial.discordId}>{initial.discordId}</option>
            ) : null}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('userOverrideEditor.reasonLabel')}
          </span>
          <input
            type="text"
            value={form.reason}
            onChange={(event) =>
              setForm((current) => ({ ...current, reason: event.target.value }))
            }
            placeholder={t('userOverrideEditor.reasonPlaceholder')}
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('userOverrideEditor.expiresAtLabel')}
          </span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                expiresAt: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white"
          />
          <span className="flex flex-wrap gap-2 pt-1">
            {[1, 7, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    expiresAt: expiryFromNow(days),
                  }))
                }
                className="min-h-10 rounded-full px-3 text-xs text-gray-300 shadow-[0_0_0_1px_rgba(255,255,255,0.13)] transition-transform active:scale-[0.96]"
              >
                {t('userOverrideEditor.expiryPresetDays', { days })}
              </button>
            ))}
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">
            {t('userOverrideEditor.notesLabel')}
          </span>
          <input
            type="text"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-white"
          />
        </label>
      </div>

      <div className="space-y-4">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-emerald-300">
            {t('userOverrideEditor.grantedHeading')}
          </h3>
          <CapabilityPicker
            value={form.capabilitiesGranted}
            onChange={(capabilitiesGranted) =>
              setForm((current) => ({ ...current, capabilitiesGranted }))
            }
          />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-rose-300">
            {t('userOverrideEditor.revokedHeading')}
          </h3>
          <CapabilityPicker
            value={form.capabilitiesRevoked}
            showPresets={false}
            onChange={(capabilitiesRevoked) =>
              setForm((current) => ({ ...current, capabilitiesRevoked }))
            }
          />
        </section>
      </div>

      <CapabilityChangeSummary
        added={capabilityLabels(grantedBits & ~revokedBits, t)}
        removed={capabilityLabels(revokedBits, t)}
      />
      {conflictBits !== 0n ? (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-pretty text-sm text-rose-200 shadow-[0_0_0_1px_rgba(244,63,94,0.35)]">
          {t('conflictWarning')}: {capabilityLabels(conflictBits, t).join(', ')}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-gray-200 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] transition-transform active:scale-[0.96]"
        >
          <X size={15} aria-hidden />
          {t('actions.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={
            isPending ||
            !form.discordId ||
            !form.expiresAt ||
            form.reason.trim().length < 5 ||
            (grantedBits === 0n && revokedBits === 0n) ||
            conflictBits !== 0n
          }
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 pl-3 pr-3.5 text-sm font-semibold text-gray-950 transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={15} aria-hidden />
          {t('actions.save')}
        </button>
      </div>
    </div>
  )
}

function OverrideStatusBadge({
  status,
}: {
  status: UserOverrideRow['status']
}) {
  const t = useTranslations('permissions')
  const style =
    status === 'active'
      ? 'bg-emerald-500/10 text-emerald-300'
      : status === 'expired'
        ? 'bg-amber-500/10 text-amber-300'
        : 'bg-gray-700/50 text-gray-400'
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${style}`}>
      {t(`userOverrideEditor.status.${status}`)}
    </span>
  )
}

function UserOverrideCard({
  override,
  member,
  members,
}: {
  override: UserOverrideRow
  member?: PermissionMemberOption
  members: PermissionMemberOption[]
}) {
  const t = useTranslations('permissions')
  const [editing, setEditing] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const granted = capabilityLabels(
    parseCapabilities(override.capabilitiesGranted),
    t,
  )
  const revoked = capabilityLabels(
    parseCapabilities(override.capabilitiesRevoked),
    t,
  )

  function revoke() {
    setError(null)
    startTransition(async () => {
      const result = await revokeUserOverride({
        discordId: override.discordId,
        expectedUpdatedAt: override.updatedAt,
        revokeReason,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setRevoking(false)
    })
  }

  if (editing) {
    return (
      <UserOverrideForm
        initial={override}
        members={members}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <article className="rounded-xl bg-gray-900/45 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-amber-100">
              {member?.name ?? override.discordId}
            </h3>
            <OverrideStatusBadge status={override.status} />
          </div>
          <p className="text-pretty text-sm text-gray-300">
            {override.reason}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock3 size={13} aria-hidden />
            <span className="tabular-nums" suppressHydrationWarning>
              {t('userOverrideEditor.expiresAtValue', {
                value: new Date(override.expiresAt).toLocaleString(),
              })}
            </span>
          </p>
          {granted.length > 0 ? (
            <p className="text-pretty text-xs text-emerald-300">
              + {granted.join(', ')}
            </p>
          ) : null}
          {revoked.length > 0 ? (
            <p className="text-pretty text-xs text-rose-300">
              − {revoked.join(', ')}
            </p>
          ) : null}
          {override.revokedReason ? (
            <p className="text-pretty text-xs text-gray-500">
              {t('userOverrideEditor.revokedReasonValue', {
                reason: override.revokedReason,
              })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-10 rounded-lg px-3 text-xs text-gray-200 shadow-[0_0_0_1px_rgba(255,255,255,0.14)] transition-transform active:scale-[0.96]"
          >
            {override.status === 'active'
              ? t('actions.edit')
              : t('actions.renew')}
          </button>
          {override.status === 'active' ? (
            <button
              type="button"
              onClick={() => setRevoking(true)}
              className="min-h-10 rounded-lg px-3 text-xs text-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.35)] transition-transform active:scale-[0.96]"
            >
              {t('actions.revoke')}
            </button>
          ) : null}
        </div>
      </div>

      {revoking ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-rose-500/5 p-3 shadow-[0_0_0_1px_rgba(244,63,94,0.25)] sm:flex-row">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-xs text-rose-200">
              {t('userOverrideEditor.revokeReasonLabel')}
            </span>
            <input
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-rose-700/50 bg-gray-950 px-3 text-sm text-white"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setRevoking(false)}
              className="min-h-10 rounded-lg px-3 text-xs text-gray-300"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={isPending || revokeReason.trim().length < 5}
              className="min-h-10 rounded-lg bg-rose-500 px-3 text-xs font-semibold text-white transition-transform active:scale-[0.96] disabled:opacity-50"
            >
              {t('actions.confirmRevoke')}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </article>
  )
}

export default function PermissionsEditor({
  initialRoleGrants,
  initialUserOverrides,
  roles,
  members,
}: Props) {
  const t = useTranslations('permissions')
  const [addingRole, setAddingRole] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const memberById = new Map(members.map((member) => [member.id, member]))
  const grantedRoleIds = new Set(
    initialRoleGrants.map((grant) => grant.discordRoleId),
  )
  const availableRoles = roles.filter((role) => !grantedRoleIds.has(role.id))

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-balance text-lg font-semibold text-white">
              <ShieldCheck size={18} className="text-amber-300" aria-hidden />
              {t('roleGrantEditor.heading')}
            </h2>
            <p className="mt-1 max-w-2xl text-pretty text-xs text-gray-500">
              {t('roleGrantEditor.description')}
            </p>
          </div>
          {!addingRole ? (
            <button
              type="button"
              onClick={() => setAddingRole(true)}
              disabled={availableRoles.length === 0}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 pl-3 pr-3.5 text-sm font-semibold text-gray-950 transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} aria-hidden />
              {t('actions.addRoleGrant')}
            </button>
          ) : null}
        </div>

        {addingRole ? (
          <RoleGrantForm
            roles={availableRoles}
            onSaved={() => setAddingRole(false)}
            onCancel={() => setAddingRole(false)}
          />
        ) : null}

        {initialRoleGrants.length === 0 && !addingRole ? (
          <div className="rounded-xl border border-dashed border-gray-700 px-4 py-7 text-center text-sm text-gray-500">
            {t('roleGrantEditor.emptyState')}
          </div>
        ) : (
          <div className="space-y-2">
            {initialRoleGrants.map((grant) => (
              <RoleGrantCard
                key={grant.discordRoleId}
                grant={grant}
                role={roleById.get(grant.discordRoleId)}
                roles={roles}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-balance text-lg font-semibold text-white">
              <UserCog size={18} className="text-amber-300" aria-hidden />
              {t('userOverrideEditor.heading')}
            </h2>
            <p className="mt-1 max-w-2xl text-pretty text-xs text-gray-500">
              {t('userOverrideEditor.description')}
            </p>
          </div>
          {!addingUser ? (
            <button
              type="button"
              onClick={() => setAddingUser(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 pl-3 pr-3.5 text-sm font-semibold text-gray-950 transition-transform active:scale-[0.96]"
            >
              <Plus size={15} aria-hidden />
              {t('actions.addUserOverride')}
            </button>
          ) : null}
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-sky-500/5 p-3 text-pretty text-xs text-sky-100 shadow-[0_0_0_1px_rgba(14,165,233,0.2)]">
          <KeyRound size={15} className="mt-0.5 shrink-0" aria-hidden />
          {t('userOverrideEditor.safetyNotice', { days: 30 })}
        </div>

        {addingUser ? (
          <UserOverrideForm
            members={members}
            onSaved={() => setAddingUser(false)}
            onCancel={() => setAddingUser(false)}
          />
        ) : null}

        {initialUserOverrides.length === 0 && !addingUser ? (
          <div className="rounded-xl border border-dashed border-gray-700 px-4 py-7 text-center text-sm text-gray-500">
            {t('userOverrideEditor.emptyState')}
          </div>
        ) : (
          <div className="space-y-2">
            {initialUserOverrides.map((override) => (
              <UserOverrideCard
                key={override.discordId}
                override={override}
                member={memberById.get(override.discordId)}
                members={members}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
