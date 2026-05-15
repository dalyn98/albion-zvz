'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X, UserPlus, Bomb } from 'lucide-react'
import { directAssignMember, listAssignableMembers } from '@/app/actions/bomb-squad'

interface Member {
  discordId: string
  username: string
  alreadyInEvent: boolean
}

interface Props {
  eventId: string
  slotId: string
  slotLabel: string
  onClose: () => void
}

export default function MemberAssignModal({ eventId, slotId, slotLabel, onClose }: Props) {
  const t = useTranslations('slot.bombSquad.callerAssign')
  const [members, setMembers] = useState<Member[] | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
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
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.username.toLowerCase().includes(q))
  }, [members, query])

  const handleAssign = (member: Member) => {
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
        className="bg-gray-900 border border-rose-500/40 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bomb size={16} className="text-rose-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 id="member-assign-modal-title" className="font-bold text-white text-base truncate">{t('title')}</h3>
              <p className="text-gray-400 text-xs truncate">{slotLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white flex-shrink-0"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <p className="text-gray-400 text-xs mb-2">{t('subtitle')}</p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-rose-500/60"
          />
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
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                            : 'bg-gray-800 border-gray-700 text-white hover:border-rose-500/50 hover:bg-rose-500/10 disabled:opacity-60 disabled:cursor-not-allowed'
                      }`}
                    >
                      <span className="text-sm font-medium truncate">{m.username}</span>
                      {m.alreadyInEvent ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-700/60 text-gray-400 flex-shrink-0">
                          {t('alreadyInEvent')}
                        </span>
                      ) : isAssigning ? (
                        <span className="text-[11px] font-semibold text-rose-300 flex-shrink-0">
                          {t('assigning')}
                        </span>
                      ) : (
                        <UserPlus size={14} className="text-rose-300 flex-shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
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
