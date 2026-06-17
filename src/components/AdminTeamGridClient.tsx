'use client'

// 운영진 카드 클라이언트 — 멤버 클릭 시 디스코드 핸들 (또는 username fallback)
// 클립보드 복사. 본 길드 어드민이면 카드별 핸들 인라인 편집 모드 진입.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Copy, Pencil, Save, X } from 'lucide-react'
import { Users } from 'lucide-react'
import { updateAdminTeamHandleAction } from '@/app/actions/admin-team'
import { ToastProvider, useToast } from './ToastProvider'

interface Member {
  discordId: string
  username: string
  avatarUrl: string | null
  publicDiscordHandle: string | null
}

interface AccentClasses {
  border: string
}

interface Props {
  members: readonly Member[]
  accent: AccentClasses
  isOwnGuildAdmin: boolean
}

const HANDLE_MAX_LENGTH = 64

export default function AdminTeamGridClient({ members, accent, isOwnGuildAdmin }: Props) {
  return (
    <ToastProvider>
      <AdminTeamGridInner
        members={members}
        accent={accent}
        isOwnGuildAdmin={isOwnGuildAdmin}
      />
    </ToastProvider>
  )
}

function AdminTeamGridInner({ members, accent, isOwnGuildAdmin }: Props) {
  const t = useTranslations('publicGuildProfile')
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()

  const copyHandle = async (member: Member) => {
    const value = member.publicDiscordHandle ?? member.username
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('adminTeamCopied', { handle: value }))
    } catch {
      toast.error(t('adminTeamCopyFailed'))
    }
  }

  const startEdit = (member: Member) => {
    setEditing(member.discordId)
    setDraft(member.publicDiscordHandle ?? '')
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
  }

  const saveEdit = (member: Member) => {
    const trimmed = draft.trim()
    if (trimmed.length > HANDLE_MAX_LENGTH) {
      toast.error(t('adminTeamHandleTooLong', { max: HANDLE_MAX_LENGTH }))
      return
    }
    startTransition(async () => {
      const r = await updateAdminTeamHandleAction({
        discordId: member.discordId,
        handle: trimmed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('adminTeamHandleSaved'))
      setEditing(null)
      setDraft('')
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {members.map((m) => {
        const displayHandle = m.publicDiscordHandle ?? m.username
        const isEditing = editing === m.discordId
        return (
          <div
            key={m.discordId}
            className={`flex flex-col gap-2 rounded-xl border ${accent.border} bg-gray-900/40 px-3 py-2.5 backdrop-blur-sm`}
          >
            <button
              type="button"
              onClick={() => copyHandle(m)}
              className="flex items-center gap-3 text-left rounded-lg hover:bg-gray-800/40 transition-colors -mx-1 px-1 py-0.5 group"
              aria-label={t('adminTeamCopyAria', { handle: displayHandle })}
            >
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.avatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full bg-gray-800 object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
                  <Users size={14} className="text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white font-medium truncate">
                    {m.username}
                  </span>
                  <Copy
                    size={11}
                    className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0"
                  />
                </div>
                {m.publicDiscordHandle && (
                  <p className="text-[10px] text-gray-500 truncate font-mono">
                    {m.publicDiscordHandle}
                  </p>
                )}
              </div>
            </button>

            {isOwnGuildAdmin &&
              (isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(m)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    placeholder={t('adminTeamHandlePlaceholder')}
                    maxLength={HANDLE_MAX_LENGTH}
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(m)}
                    className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 flex-shrink-0"
                    aria-label={t('adminTeamHandleSave')}
                  >
                    <Save size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="p-1.5 rounded text-gray-400 hover:bg-gray-800 flex-shrink-0"
                    aria-label={t('adminTeamHandleCancel')}
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                >
                  {m.publicDiscordHandle ? (
                    <>
                      <Pencil size={10} />
                      {t('adminTeamHandleEdit')}
                    </>
                  ) : (
                    <>
                      <Check size={10} />
                      {t('adminTeamHandleAdd')}
                    </>
                  )}
                </button>
              ))}
          </div>
        )
      })}
    </div>
  )
}
