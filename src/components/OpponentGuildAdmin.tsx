'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Flag, Plus, Pencil, Trash2, Loader2, X, Check } from 'lucide-react'
import {
  createOpponentGuild,
  updateOpponentGuild,
  deleteOpponentGuild,
} from '@/app/actions/opponent-guilds'
import type { OpponentGuild } from '@/types'

interface Props {
  initialGuilds: OpponentGuild[]
}

export default function OpponentGuildAdmin({ initialGuilds }: Props) {
  const t = useTranslations('adminOpponentGuilds')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [guilds, setGuilds] = useState<OpponentGuild[]>(initialGuilds)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const sorted = useMemo(() => [...guilds].sort((a, b) => a.name.localeCompare(b.name)), [guilds])

  const create = () => {
    const name = newName.trim()
    if (!name) return
    setError('')
    startTransition(async () => {
      const result = await createOpponentGuild(name, newNotes)
      if (result.error || !result.guild) {
        setError(result.error ?? t('createFailed'))
        return
      }
      setGuilds((prev) => [...prev, result.guild!])
      setNewName('')
      setNewNotes('')
      setCreating(false)
      router.refresh()
    })
  }

  const startEdit = (guild: OpponentGuild) => {
    setEditingId(guild.id)
    setEditName(guild.name)
    setEditNotes(guild.notes ?? '')
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditNotes('')
  }

  const saveEdit = (id: string) => {
    const name = editName.trim()
    if (!name) return
    setError('')
    startTransition(async () => {
      const result = await updateOpponentGuild(id, name, editNotes)
      if (result.error) {
        setError(result.error)
        return
      }
      setGuilds((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name, notes: editNotes.trim() || null } : g)),
      )
      cancelEdit()
      router.refresh()
    })
  }

  const remove = (guild: OpponentGuild) => {
    if (!confirm(t('deleteConfirm', { name: guild.name }))) return
    setError('')
    startTransition(async () => {
      const result = await deleteOpponentGuild(guild.id)
      if (result.error) {
        setError(result.error)
        return
      }
      setGuilds((prev) => prev.filter((g) => g.id !== guild.id))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded text-sm"
          >
            <Plus size={14} />
            {t('addGuild')}
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={100}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              maxLength={500}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={create}
                disabled={pending || !newName.trim()}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded text-sm"
              >
                {pending && <Loader2 size={13} className="animate-spin" />}
                {tCommon('save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setNewName('')
                  setNewNotes('')
                }}
                className="text-xs text-gray-400 hover:text-white px-3 py-2"
              >
                {tCommon('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Flag size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((guild) =>
            editingId === guild.id ? (
              <li
                key={guild.id}
                className="bg-gray-900 border border-amber-500/40 rounded-lg p-3 space-y-2"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                  maxLength={500}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(guild.id)}
                    disabled={pending || !editName.trim()}
                    className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-3 py-1.5 rounded text-xs"
                  >
                    <Check size={12} />
                    {tCommon('save')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex items-center gap-1 text-gray-400 hover:text-white px-3 py-1.5 text-xs"
                  >
                    <X size={12} />
                    {tCommon('cancel')}
                  </button>
                </div>
              </li>
            ) : (
              <li
                key={guild.id}
                className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3"
              >
                <Flag size={16} className="text-amber-400 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{guild.name}</p>
                  {guild.notes && (
                    <p className="text-gray-400 text-xs mt-1 whitespace-pre-wrap">{guild.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(guild)}
                    className="p-2 text-gray-500 hover:text-amber-300"
                    aria-label={tCommon('edit')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(guild)}
                    disabled={pending}
                    className="p-2 text-gray-500 hover:text-red-400 disabled:opacity-30"
                    aria-label={tCommon('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
