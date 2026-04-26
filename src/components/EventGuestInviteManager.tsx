'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy, Check, Link2, Plus, Ban, X } from 'lucide-react'
import {
  createEventGuestToken,
  listEventGuestTokens,
  revokeEventGuestToken,
  type EventGuestToken,
} from '@/app/actions/event-invites'
import { formatDateTime } from '@/lib/format-datetime'

interface Props {
  eventId: string
  initialTokens: EventGuestToken[]
  origin: string
  tenantTimezone: string
}

function buildInviteUrl(origin: string, eventId: string, token: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/events/${eventId}?invite=${encodeURIComponent(token)}`
}

function isActive(token: EventGuestToken, nowIso: string): boolean {
  if (token.revoked_at) return false
  if (token.expires_at && token.expires_at <= nowIso) return false
  return true
}

export default function EventGuestInviteManager({ eventId, initialTokens, origin, tenantTimezone }: Props) {
  const t = useTranslations('eventGuestInvite')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<EventGuestToken[]>(initialTokens)
  const [pending, startTransition] = useTransition()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const nowIso = new Date().toISOString()
  const activeTokens = tokens.filter((t) => isActive(t, nowIso))

  const handleOpen = () => {
    setOpen(true)
    setError('')
    // 최신 상태로 다시 가져오기 (다른 관리자가 추가/폐기했을 수 있음)
    startTransition(async () => {
      const res = await listEventGuestTokens(eventId)
      if (res.error) setError(res.error)
      else if (res.tokens) setTokens(res.tokens)
    })
  }

  const handleCreate = () => {
    setError('')
    startTransition(async () => {
      const res = await createEventGuestToken(eventId)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.token) setTokens((prev) => [res.token!, ...prev])
      router.refresh()
    })
  }

  const handleCopy = async (tokenId: string, token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(origin, eventId, token))
      setCopiedId(tokenId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setError(t('copyFailed'))
    }
  }

  const handleRevoke = (tokenId: string) => {
    if (!confirm(t('revokeConfirm'))) return
    startTransition(async () => {
      const res = await revokeEventGuestToken(tokenId, eventId)
      if (res.error) {
        setError(res.error)
        return
      }
      setTokens((prev) =>
        prev.map((t) => (t.id === tokenId ? { ...t, revoked_at: new Date().toISOString() } : t)),
      )
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 text-sm font-bold px-2.5 py-1 rounded-full transition-colors"
        aria-label={t('buttonAria')}
      >
        <Link2 size={12} />
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{t('title')}</h2>
                <p className="text-gray-400 text-xs mt-1 whitespace-pre-wrap">{t('description')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Plus size={14} />
              {pending ? tCommon('loading') : t('create')}
            </button>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
                {error}
              </div>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tokens.length === 0 && (
                <p className="text-gray-500 text-xs text-center py-4">{t('empty')}</p>
              )}
              {tokens.map((token) => {
                const active = isActive(token, nowIso)
                const url = buildInviteUrl(origin, eventId, token.token)
                return (
                  <div
                    key={token.id}
                    className={`border rounded-lg p-3 space-y-2 ${
                      active
                        ? 'bg-gray-800/40 border-gray-700'
                        : 'bg-gray-900/40 border-gray-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={url}
                        className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-[11px] text-gray-300 font-mono focus:outline-none"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(token.id, token.token)}
                        disabled={!active}
                        className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 px-2 py-1.5 rounded text-[11px]"
                      >
                        {copiedId === token.id ? <Check size={11} /> : <Copy size={11} />}
                        {copiedId === token.id ? tCommon('copied') : tCommon('copy')}
                      </button>
                      {active && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(token.id)}
                          disabled={pending}
                          className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 px-2 py-1.5 rounded text-[11px]"
                          title={t('revoke')}
                        >
                          <Ban size={11} />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
                      {token.created_by_username && (
                        <span>{t('createdBy', { name: token.created_by_username })}</span>
                      )}
                      {token.expires_at && (
                        <span>
                          {t('expiresAt', {
                            at: formatDateTime(token.expires_at, tenantTimezone),
                          })}
                        </span>
                      )}
                      {token.revoked_at && (
                        <span className="text-red-400">{t('statusRevoked')}</span>
                      )}
                      {!token.revoked_at &&
                        token.expires_at &&
                        token.expires_at <= nowIso && (
                          <span className="text-amber-400">{t('statusExpired')}</span>
                        )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[10px] text-gray-600">
              {t('activeCount', { count: activeTokens.length })}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
