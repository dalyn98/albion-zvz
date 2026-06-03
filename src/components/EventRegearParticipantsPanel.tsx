'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import {
  removeEventRegearParticipant,
  upsertEventRegearParticipant,
  type EventRegearParticipantRow,
} from '@/app/actions/event-regear-participants'
import { filterAssignableMembers, type AssignableMember } from '@/lib/member-assign-search'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { SLOT_ROLES, getRoleStyle, type SlotRole } from '@/types'
import { useConfirm } from '@/components/ConfirmDialog'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { useToast } from './ToastProvider'

interface DirectoryMember {
  discord_id: string
  username: string
  albion_nickname?: string | null
  avatar?: string | null
}

interface Props {
  eventId: string
  rows: EventRegearParticipantRow[]
  avatars: Record<string, string | null>
  memberDirectory: DirectoryMember[]
  canManage: boolean
}

export default function EventRegearParticipantsPanel({
  eventId,
  rows,
  avatars,
  memberDirectory,
  canManage,
}: Props) {
  const t = useTranslations('eventRegearParticipants')
  const tRole = useTranslations('slotRole')
  const tCommon = useTranslations('common')

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
          <h2 className="truncate text-base sm:text-lg font-bold text-white">{t('title')}</h2>
          <span className="shrink-0 font-mono text-xs text-gray-400">
            {t('countSummary', { n: rows.length })}
          </span>
        </div>
      </div>
      <p className="text-xs sm:text-sm text-gray-400">{t('description')}</p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2.5">
          <p className="text-xs text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <ParticipantRow
              key={row.id}
              eventId={eventId}
              row={row}
              avatar={avatars[row.discord_id] ?? null}
              canManage={canManage}
              t={t}
              tRole={tRole}
              tCommon={tCommon}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <AddParticipantPanel
          eventId={eventId}
          rows={rows}
          memberDirectory={memberDirectory}
          t={t}
          tRole={tRole}
          tCommon={tCommon}
        />
      )}
    </section>
  )
}

function ParticipantRow({
  eventId,
  row,
  avatar,
  canManage,
  t,
  tRole,
  tCommon,
}: {
  eventId: string
  row: EventRegearParticipantRow
  avatar: string | null
  canManage: boolean
  t: ReturnType<typeof useTranslations<'eventRegearParticipants'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  tCommon: ReturnType<typeof useTranslations<'common'>>
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const askConfirm = useConfirm()
  const style = getRoleStyle(row.role_name)

  const remove = async () => {
    const ok = await askConfirm({
      body: t('confirmRemove', { name: row.username }),
      destructive: true,
    })
    if (!ok) return

    startTransition(async () => {
      const result = await removeEventRegearParticipant(eventId, row.discord_id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('toastRemoved'))
      router.refresh()
    })
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-800/40">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <MemberAvatar discordId={row.discord_id} avatar={avatar} size={20} />
        <MemberLink
          discordId={row.discord_id}
          username={row.username}
          className="truncate text-sm font-medium text-white"
        />
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            style?.badge ?? 'bg-gray-700 text-gray-200'
          }`}
        >
          {translateSlotRole(row.role_name, tRole)}
        </span>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="shrink-0 rounded p-1 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
          aria-label={tCommon('delete')}
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
        </button>
      )}
    </li>
  )
}

function AddParticipantPanel({
  eventId,
  rows,
  memberDirectory,
  t,
  tRole,
  tCommon,
}: {
  eventId: string
  rows: EventRegearParticipantRow[]
  memberDirectory: DirectoryMember[]
  t: ReturnType<typeof useTranslations<'eventRegearParticipants'>>
  tRole: ReturnType<typeof useTranslations<'slotRole'>>
  tCommon: ReturnType<typeof useTranslations<'common'>>
}) {
  const [open, setOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState('')
  const [selectedRole, setSelectedRole] = useState<SlotRole | ''>('')
  const [memberQuery, setMemberQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()
  const toast = useToast()

  const existingDiscordIds = useMemo(
    () => new Set(rows.map((row) => row.discord_id)),
    [rows],
  )
  const eligible = useMemo(
    () => memberDirectory.filter((member) => !existingDiscordIds.has(member.discord_id)),
    [memberDirectory, existingDiscordIds],
  )
  const searchableMembers = useMemo<AssignableMember[]>(
    () =>
      eligible.map((member) => ({
        discordId: member.discord_id,
        username: member.username,
        albionNickname: member.albion_nickname ?? null,
        avatar: member.avatar ?? null,
        alreadyInEvent: false,
      })),
    [eligible],
  )
  const filteredMembers = useMemo(
    () => filterAssignableMembers(searchableMembers, memberQuery, 'available').slice(0, 8),
    [searchableMembers, memberQuery],
  )
  const selectedMemberInfo = eligible.find((member) => member.discord_id === selectedMember) ?? null

  const close = () => {
    setOpen(false)
    setError('')
    setMemberQuery('')
    setSelectedMember('')
    setSelectedRole('')
  }

  const submit = () => {
    setError('')
    const member = eligible.find((candidate) => candidate.discord_id === selectedMember)
    if (!member) {
      setError(t('memberRequired'))
      return
    }
    if (!selectedRole) {
      setError(t('roleRequired'))
      return
    }

    startTransition(async () => {
      const result = await upsertEventRegearParticipant(eventId, member.discord_id, selectedRole)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(t('toastAdded'))
      close()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
      >
        <UserPlus size={12} />
        {t('addButton')}
      </button>
    )
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
      <p className="text-xs font-semibold text-gray-200">{t('addTitle')}</p>
      <div className="space-y-2">
        <label className="block text-[11px] text-gray-400">{t('memberLabel')}</label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder={t('memberSearchPlaceholder')}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 py-1.5 pl-8 pr-8 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
          />
          {memberQuery && (
            <button
              type="button"
              onClick={() => setMemberQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
              aria-label={t('memberClearSearch')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {selectedMemberInfo ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2">
            <MemberCandidateSummary
              member={selectedMemberInfo}
              albionLabel={t('memberAlbionLabel')}
              selectedLabel={t('memberSelected')}
            />
            <button
              type="button"
              onClick={() => setSelectedMember('')}
              className="rounded p-1 text-emerald-200/80 hover:bg-emerald-500/10 hover:text-emerald-100"
              aria-label={t('memberClearSelection')}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <p className="rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-2 text-xs text-gray-500">
            {t('memberPlaceholder')}
          </p>
        )}

        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/40 p-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-500">
            {t('memberAvailableSummary', { count: eligible.length })}
          </p>
          {filteredMembers.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-gray-500">{t('memberNoMatches')}</p>
          ) : (
            <ul className="space-y-1">
              {filteredMembers.map((member) => (
                <li key={member.discordId}>
                  <button
                    type="button"
                    onClick={() => setSelectedMember(member.discordId)}
                    className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                      selectedMember === member.discordId
                        ? 'bg-emerald-500/15 text-emerald-100'
                        : 'text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <MemberCandidateSummary
                      member={{
                        discord_id: member.discordId,
                        username: member.username,
                        albion_nickname: member.albionNickname,
                        avatar: member.avatar,
                      }}
                      albionLabel={t('memberAlbionLabel')}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] text-gray-400">{t('roleLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {SLOT_ROLES.map((role) => {
            const checked = selectedRole === role
            const style = getRoleStyle(role)
            return (
              <label
                key={role}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  checked
                    ? style?.badge ?? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-white'
                }`}
              >
                <input
                  type="radio"
                  name="event-regear-participant-role"
                  checked={checked}
                  onChange={() => setSelectedRole(role)}
                  className="sr-only"
                />
                {checked && <Check size={10} />}
                {translateSlotRole(role, tRole)}
              </label>
            )
          })}
        </div>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('saveButton')}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  )
}

function MemberCandidateSummary({
  member,
  albionLabel,
  selectedLabel,
}: {
  member: DirectoryMember
  albionLabel: string
  selectedLabel?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar discordId={member.discord_id} avatar={member.avatar ?? null} size={22} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-white">{member.username}</span>
          {selectedLabel && (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
              {selectedLabel}
            </span>
          )}
        </span>
        <span className="block truncate text-[10px] text-gray-500">
          {member.albion_nickname
            ? `${albionLabel}: ${member.albion_nickname} · ${member.discord_id}`
            : member.discord_id}
        </span>
      </span>
    </span>
  )
}
