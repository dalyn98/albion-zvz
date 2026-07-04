'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Search, Users, X } from 'lucide-react'
import { directAssignMember, listAssignableMembers } from '@/app/actions/bomb-squad'
import {
  filterAssignableMembers,
  type AssignableMember,
  type AssignableMemberFilter,
} from '@/lib/member-assign-search'
import MemberAvatar from './MemberAvatar'
import { useBodyScrollLock } from './useBodyScrollLock'

interface Props {
  eventId: string
  slotId: string
  slotLabel: string
  tone?: 'amber' | 'rose'
  onClose: () => void
}

export default function MemberAssignModal({
  eventId,
  slotId,
  slotLabel,
  tone = 'amber',
  onClose,
}: Props) {
  const t = useTranslations('slot.directAssign')
  const [members, setMembers] = useState<AssignableMember[] | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssignableMemberFilter>('available')
  const [actionError, setActionError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  useBodyScrollLock(true)
  const toneClasses =
    tone === 'rose'
      ? {
          border: 'border-rose-500/40',
          icon: 'text-rose-400',
          focus: 'focus:border-rose-500/60',
          active: 'bg-rose-500/15 border-rose-500/50 text-rose-200',
          hover: 'hover:border-rose-500/50 hover:bg-rose-500/10',
          assigning: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
          subtle: 'text-rose-300',
        }
      : {
          border: 'border-amber-500/40',
          icon: 'text-amber-400',
          focus: 'focus:border-amber-500/60',
          active: 'bg-amber-500/15 border-amber-500/50 text-amber-200',
          hover: 'hover:border-amber-500/50 hover:bg-amber-500/10',
          assigning: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
          subtle: 'text-amber-300',
        }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await listAssignableMembers(eventId)
      if (cancelled) return
      if (result.error) {
        setFetchError(result.error)
        setMembers([])
        return
      }
      setMembers(result.members ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [eventId])

  const filtered = useMemo(() => {
    if (!members) return []
    return filterAssignableMembers(members, query, filter)
  }, [members, query, filter])
  const totalAvailable = members?.filter((m) => !m.alreadyInEvent).length ?? 0
  const totalAssigned = members?.filter((m) => m.alreadyInEvent).length ?? 0

  const handleAssign = (member: AssignableMember) => {
    if (member.alreadyInEvent) return
    setActionError('')
    setPendingId(member.discordId)
    startTransition(async () => {
      const result = await directAssignMember(slotId, member.discordId)
      if (result.error) {
        setActionError(result.error)
        setPendingId(null)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-assign-modal-title"
        className={`bg-gray-900 border ${toneClasses.border} w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={16} className={`${toneClasses.icon} flex-shrink-0`} />
            <div className="min-w-0">
              <h3 id="member-assign-modal-title" className="font-bold text-white text-base truncate">{t('title')}</h3>
              <p className="text-gray-400 text-xs truncate">{slotLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-white"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              autoFocus
              className={`w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none ${toneClasses.focus}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
                aria-label={t('clearSearch')}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
            {([
              ['available', t('filterAvailable', { count: totalAvailable })],
              ['all', t('filterAll', { count: members?.length ?? 0 })],
              ['assigned', t('filterAssigned', { count: totalAssigned })],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  filter === value
                    ? toneClasses.active
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {members === null && (
            <p className="text-center text-gray-500 text-sm py-6">{t('loading')}</p>
          )}
          {members !== null && fetchError && (
            <p className="text-center text-red-400 text-sm py-6">{fetchError}</p>
          )}
          {members !== null && !fetchError && filtered.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">{t('noMatches')}</p>
          )}
          {members !== null && !fetchError && filtered.length > 0 && (
            <div className="space-y-2">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {t('resultSummary', { count: filtered.length })}
              </p>
              <ul className="space-y-1">
                {filtered.map((m) => {
                  const isAssigning = pendingId === m.discordId && pending
                  const disabled = m.alreadyInEvent || pending
                  return (
                    <li key={m.discordId}>
                      <button
                        type="button"
                        onClick={() => handleAssign(m)}
                        disabled={disabled}
                        className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 border text-left transition-colors ${
                          m.alreadyInEvent
                            ? 'bg-gray-800/40 border-gray-800 text-gray-500 cursor-not-allowed'
                            : isAssigning
                              ? toneClasses.assigning
                              : `bg-gray-800 border-gray-700 text-white ${toneClasses.hover} disabled:opacity-60 disabled:cursor-not-allowed`
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <MemberAvatar discordId={m.discordId} avatar={m.avatar} size={24} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold truncate">{m.username}</span>
                            <span className="block text-[11px] text-gray-500 truncate">
                              {m.albionNickname
                                ? `${t('albionName')}: ${m.albionNickname} · ${m.discordId}`
                                : m.discordId}
                            </span>
                          </span>
                        </span>
                        {m.alreadyInEvent ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-700/60 text-gray-400 flex-shrink-0">
                            {t('alreadyInEvent')}
                          </span>
                        ) : isAssigning ? (
                          <span className={`text-[11px] font-semibold ${toneClasses.subtle} flex-shrink-0`}>
                            {t('assigning')}
                          </span>
                        ) : (
                          <CheckCircle2 size={15} className={`${toneClasses.subtle} flex-shrink-0`} />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {actionError && (
          <div className="flex-shrink-0 border-t border-gray-800 px-4 py-2">
            <p className="text-red-400 text-xs">{actionError}</p>
          </div>
        )}
      </div>
    </div>
  )
}
